-- ============================================================================
-- Ninja BP Arena · 在线 BP 房间 schema（v0.3.1）
-- 安全模型（最小权限）：
--   * 客户端（authenticated/anon）对三张业务表只有 SELECT；
--     rooms / room_members / room_commands 的一切写入都通过
--     service role 的 Edge Function（create / join / command）完成。
--   * 权限判断统一走 private schema 的 SECURITY DEFINER 函数，
--     避免 room_members RLS 自引用递归。
--   * 房间创建、状态 CAS 写入 + 审计均为数据库事务（原子）。
--   * 本文件必须能从空数据库一次性 supabase db reset 成功。
-- ============================================================================

-- Supabase 默认把扩展安装在 extensions schema
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- private schema：安全辅助函数与 RPC（不通过 PostgREST 暴露）
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

-- service_role（Edge Function）与 postgres（测试/运维）需要 USAGE 才能调用函数；
-- authenticated 需要 USAGE 才能让 RLS 策略调用 is_room_member
grant usage on schema private to service_role;
grant usage on schema private to postgres;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- rooms：权威 MatchState 的唯一存放处
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 4 and 8),
  host_user_id uuid not null,
  status text not null default 'WAITING' check (status in ('WAITING', 'ACTIVE', 'FINISHED', 'CLOSED')),
  match_state jsonb not null,
  pool jsonb not null default '[]'::jsonb,
  revision bigint not null default 0,
  pending_action jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_expires_at_idx on public.rooms (expires_at);

-- ---------------------------------------------------------------------------
-- room_members：席位唯一性由数据库部分唯一索引保证
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

create unique index if not exists room_members_seat_blue_idx
  on public.room_members (room_id) where seat = 'BLUE';
create unique index if not exists room_members_seat_red_idx
  on public.room_members (room_id) where seat = 'RED';
create index if not exists room_members_room_idx on public.room_members (room_id);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- ---------------------------------------------------------------------------
-- room_commands：命令审计（幂等靠 command_id unique 约束）
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
-- join_attempts：加入尝试限速（成功与否都计数；只有 service role 读写）
-- ---------------------------------------------------------------------------
create table if not exists public.join_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_time_idx on public.join_attempts (user_id, attempted_at);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

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
-- private.is_room_member：SECURITY DEFINER 成员判断
-- （ rooms / room_members / room_commands 的 RLS 都用它，避免自引用递归）
-- ---------------------------------------------------------------------------
create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  )
$$;

revoke all on function private.is_room_member(uuid) from public;
revoke all on function private.is_room_member(uuid) from anon;
revoke all on function private.is_room_member(uuid) from authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- private.create_room_transaction：创建房间 + 房主入座（原子）。
-- 房间码用 pgcrypto 加密学随机源生成；唯一冲突自动重试。
-- 只允许 service role（Edge Function）调用。
-- ---------------------------------------------------------------------------
create or replace function public.create_room_transaction(
  p_user_id uuid,
  p_seat text,
  p_display_name text,
  p_match_state jsonb,
  p_pool jsonb
)
returns table (room_id uuid, room_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_charset text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
  v_bytes bytea;
  v_i int;
begin
  if p_seat not in ('BLUE', 'RED') then
    raise exception 'INVALID_SEAT';
  end if;
  if char_length(p_display_name) < 1 or char_length(p_display_name) > 20 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  if jsonb_typeof(p_pool) <> 'array' or jsonb_array_length(p_pool) > 2000 then
    raise exception 'INVALID_POOL';
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 6 then
      raise exception 'CODE_GEN_FAILED';
    end if;
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_charset, (get_byte(v_bytes, v_i - 1) % 31) + 1, 1);
    end loop;

    begin
      insert into public.rooms (code, host_user_id, status, match_state, pool)
      values (v_code, p_user_id, 'WAITING', p_match_state, p_pool)
      returning id into v_id;
      exit;
    exception when unique_violation then
      null;  -- 房间码冲突 → 换一个重试
    end;
  end loop;

  insert into public.room_members (room_id, user_id, seat, display_name)
  values (v_id, p_user_id, p_seat, p_display_name);

  return query select v_id, v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- private.apply_room_state_cas：revision CAS 写入 + 命令审计（同一事务）。
-- 返回新 revision；-1 表示 commandId 幂等命中；REVISION_CONFLICT 异常会整体回滚。
-- 只允许 service role（Edge Function）调用。
-- ---------------------------------------------------------------------------
create or replace function public.apply_room_state_cas(
  p_room_id uuid,
  p_expected_revision bigint,
  p_command_id uuid,
  p_user_id uuid,
  p_command_type text,
  p_payload jsonb,
  p_next_match_state jsonb,
  p_next_status text,
  p_next_pending_action jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_revision bigint;
begin
  begin
    insert into public.room_commands
      (command_id, room_id, user_id, command_type, expected_revision, payload, status)
    values
      (p_command_id, p_room_id, p_user_id, p_command_type, p_expected_revision, p_payload, 'APPLIED');
  exception when unique_violation then
    return -1;  -- 幂等命中：该命令此前已被应用
  end;

  update public.rooms
  set match_state = p_next_match_state,
      revision = revision + 1,
      status = p_next_status,
      pending_action = p_next_pending_action
  where id = p_room_id
    and revision = p_expected_revision
  returning revision into v_new_revision;

  if v_new_revision is null then
    raise exception 'REVISION_CONFLICT';
  end if;

  update public.room_commands
  set applied_revision = v_new_revision
  where command_id = p_command_id;

  return v_new_revision;
end;
$$;

revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb) from anon;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb) from authenticated;
grant execute on function public.create_room_transaction(uuid, text, text, jsonb, jsonb) to service_role;

revoke all on function public.apply_room_state_cas(uuid, bigint, uuid, uuid, text, jsonb, jsonb, text, jsonb) from public;
revoke all on function public.apply_room_state_cas(uuid, bigint, uuid, uuid, text, jsonb, jsonb, text, jsonb) from anon;
revoke all on function public.apply_room_state_cas(uuid, bigint, uuid, uuid, text, jsonb, jsonb, text, jsonb) from authenticated;
grant execute on function public.apply_room_state_cas(uuid, bigint, uuid, uuid, text, jsonb, jsonb, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- RLS：客户端只读
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_commands enable row level security;

drop policy if exists "rooms_select_members" on public.rooms;
create policy "rooms_select_members"
  on public.rooms for select
  using (private.is_room_member(id));

drop policy if exists "rooms_insert_host" on public.rooms;
drop policy if exists "room_members_select_members" on public.room_members;
create policy "room_members_select_members"
  on public.room_members for select
  using (private.is_room_member(room_id));

drop policy if exists "room_members_insert_self" on public.room_members;
drop policy if exists "room_members_update_self" on public.room_members;
drop policy if exists "room_members_delete_self" on public.room_members;
drop policy if exists "room_commands_select_members" on public.room_commands;
create policy "room_commands_select_members"
  on public.room_commands for select
  using (private.is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- Table Grants：显式收回一切写权限，只保留成员 SELECT
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.rooms from anon, authenticated;
revoke insert, update, delete, truncate on public.room_members from anon, authenticated;
revoke insert, update, delete, truncate on public.room_commands from anon, authenticated;
revoke all on public.join_attempts from anon, authenticated;

grant select on public.rooms to authenticated;
grant select on public.room_members to authenticated;
grant select on public.room_commands to authenticated;

-- service_role（Edge Functions）需要完整读写
grant select, insert, update, delete on public.rooms to service_role;
grant select, insert, update, delete on public.room_members to service_role;
grant select, insert, update, delete on public.room_commands to service_role;
grant select, insert, update, delete on public.join_attempts to service_role;

-- ---------------------------------------------------------------------------
-- Realtime publication（postgres_changes 受 RLS 保护：非成员收不到事件）
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
