-- ============================================================================
-- v0.3.2 安全加固（0001 之后追加；0001 视为 immutable）
--   1. room_commands 幂等范围收紧：command_id 全局唯一 → (room_id, user_id, command_id)
--      幂等语义 = 同一命令只在「同一房间 + 同一用户」内重放；
--      跨房间 / 跨用户复用 command_id 由 Edge Function 判定 IDEMPOTENCY_KEY_REUSE。
--   2. join_attempts → action_attempts（通用限速数据）：
--      增加 action_type（JOIN_ROOM / CREATE_ROOM），支撑两种端点的限速。
--   3. apply_room_state_cas 审计更新按 (command_id, room_id, user_id) 定位，
--      适配范围化幂等（其余逻辑与 0001 一致）。
-- ============================================================================

-- 1. 幂等约束范围化
alter table public.room_commands
  drop constraint if exists room_commands_command_id_key;

create unique index if not exists room_commands_idempotency_idx
  on public.room_commands (room_id, user_id, command_id);

-- 2. 限速数据通用化
alter table public.join_attempts rename to action_attempts;

alter table public.action_attempts
  add column if not exists action_type text not null default 'JOIN_ROOM';

alter table public.action_attempts
  drop constraint if exists action_attempts_type_chk;
alter table public.action_attempts
  add constraint action_attempts_type_chk
  check (action_type in ('JOIN_ROOM', 'CREATE_ROOM'));

drop index if exists join_attempts_user_time_idx;
create index if not exists action_attempts_user_action_time_idx
  on public.action_attempts (user_id, action_type, attempted_at);

-- 3. CAS RPC 审计更新按幂等范围定位
--    command_id 不再全局唯一后，「where command_id = ...」可能同时命中
--    其他房间对同一 command_id 的合法审计行，导致 applied_revision 交叉覆盖。
--    其余逻辑与 0001 完全一致（仅追加 room_id / user_id 条件）。
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
    return -1;  -- 幂等命中：该命令此前已被应用（同 room + 同 user）
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
  where command_id = p_command_id
    and room_id = p_room_id
    and user_id = p_user_id;

  return v_new_revision;
end;
$$;
