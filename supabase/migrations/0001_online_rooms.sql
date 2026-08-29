-- ============================================================================
-- Ninja BP Arena · 在线 BP 房间 schema（v0.3.0）
-- 表 / 索引 / RLS / Realtime 一次性可复现，禁止只在 Dashboard 手工创建。
-- 安全边界：客户端永远不能直接修改 match_state，只能通过 room-command Edge Function。
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 房间：权威 MatchState 的唯一存放处
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- 对用户展示的房间号（6 位，避开 0/O、1/I/L 等混淆字符），UNIQUE 由数据库保证
  code text not null unique check (char_length(code) between 4 and 8),
  host_user_id uuid not null,
  status text not null default 'WAITING' check (status in ('WAITING', 'ACTIVE', 'FINISHED', 'CLOSED')),
  -- 权威 MatchState（shared/bp-core 结构），仅 Edge Function（service role）可写
  match_state jsonb not null,
  -- 房间忍者池快照（[{id, enabled}]）：创建时固化，
  -- 服务端据此校验 SELECT_NINJA 的忍者存在与启用（与本地模式同语义）
  pool jsonb not null default '[]'::jsonb,
  -- 乐观锁版本号：所有状态更新必须 WHERE revision = expected
  revision bigint not null default 0,
  -- 挂起的撤销请求 { type, requestedBy, requestedByUserId, targetRevision, createdAt }
  pending_action jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 房间有效期 24h，过期禁止加入与操作
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_expires_at_idx on public.rooms (expires_at);

-- ---------------------------------------------------------------------------
-- 房间成员：seat 唯一性由数据库部分唯一索引保证（不是前端判断）
-- 同一 user 在同一房间只有一条 member（多标签页不会占两个席位）
-- ---------------------------------------------------------------------------
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  seat text not null check (seat in ('BLUE', 'RED', 'OBSERVER')),
  display_name text not null default '玩家' check (char_length(display_name) between 1 and 20),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, user_id)
);

-- 同一房间最多一个 BLUE / 一个 RED
create unique index if not exists room_members_seat_blue_idx
  on public.room_members (room_id) where seat = 'BLUE';
create unique index if not exists room_members_seat_red_idx
  on public.room_members (room_id) where seat = 'RED';

create index if not exists room_members_room_idx on public.room_members (room_id);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ---------------------------------------------------------------------------
-- 命令审计：command_id 幂等 + 排错（不保存完整 MatchState）
-- 客户端没有 INSERT 权限，只有 Edge Function（service role）写入
-- ---------------------------------------------------------------------------
create table if not exists public.room_commands (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid,
  command_type text not null,
  expected_revision bigint,
  applied_revision bigint,
  payload jsonb,
  status text not null check (status in ('APPLIED', 'REJECTED')),
  reject_code text,
  created_at timestamptz not null default now()
);

create index if not exists room_commands_room_idx on public.room_commands (room_id);
create index if not exists room_commands_command_id_idx on public.room_commands (command_id);

-- ---------------------------------------------------------------------------
-- updated_at 自动维护
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS：全部业务表 ENABLE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_commands enable row level security;

-- rooms：只有成员（含观战）可以读取；创建时 host_user_id 必须是自己；
-- 客户端没有任何 UPDATE / DELETE 权限（状态只能经 room-command Edge Function）
drop policy if exists "rooms_select_members" on public.rooms;
create policy "rooms_select_members"
  on public.rooms for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = rooms.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "rooms_insert_host" on public.rooms;
create policy "rooms_insert_host"
  on public.rooms for insert
  with check (auth.uid() = host_user_id);

-- room_members：同房间成员可读花名册；本人可以加入 / 更新自己的在线信息 / 退出
drop policy if exists "room_members_select_members" on public.room_members;
create policy "room_members_select_members"
  on public.room_members for select
  using (
    exists (
      select 1 from public.room_members me
      where me.room_id = room_members.room_id and me.user_id = auth.uid()
    )
  );

drop policy if exists "room_members_insert_self" on public.room_members;
create policy "room_members_insert_self"
  on public.room_members for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'WAITING' and r.expires_at > now()
    )
  );

drop policy if exists "room_members_update_self" on public.room_members;
create policy "room_members_update_self"
  on public.room_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "room_members_delete_self" on public.room_members;
create policy "room_members_delete_self"
  on public.room_members for delete
  using (auth.uid() = user_id);

-- room_commands：同房间成员可读审计；客户端不可写入（无 INSERT/UPDATE 策略）
drop policy if exists "room_commands_select_members" on public.room_commands;
create policy "room_commands_select_members"
  on public.room_commands for select
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = room_commands.room_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime：把 rooms / room_members 加入 publication，
-- 客户端通过 postgres_changes 订阅（受 RLS 保护：非成员收不到事件）。
-- 幂等处理：publication 若不存在则先创建（supabase 默认项目已存在）。
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
