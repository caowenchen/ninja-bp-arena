-- ============================================================================
-- v0.3.2 安全加固（0001 之后追加；0001 视为 immutable）
--   1. room_commands 幂等范围收紧：command_id 全局唯一 → (room_id, user_id, command_id)
--      幂等语义 = 同一命令只在「同一房间 + 同一用户」内重放；
--      跨房间 / 跨用户复用 command_id 由 Edge Function 判定 IDEMPOTENCY_KEY_REUSE。
--   2. join_attempts → action_attempts（通用限速数据）：
--      增加 action_type（JOIN_ROOM / CREATE_ROOM），支撑两种端点的限速。
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
