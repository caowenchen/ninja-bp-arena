-- ============================================================================
-- v0.4.0 数据包元数据（0001 / 0002 视为 immutable，只追加）
--   1. rooms.data_pack_metadata：房主创建房间时固化的数据包元信息
--      （packId / packVersion / checksum），加入方用于一致性提示。
--   2. create_room_transaction 增加可选参数 p_data_pack_metadata（默认 null），
--      房间 + 房主入座 + 元信息在同一事务内写入；旧调用（5 参）保持兼容。
-- ============================================================================

alter table public.rooms
  add column if not exists data_pack_metadata jsonb;

-- 参与在线 BP 一致性展示的元信息结构：{"packId","schemaVersion","packVersion","checksum"}
-- 仅 informational：真正决定比赛数据的是 rooms.pool（Ninja Snapshot），
-- 服务端在 room-create 中已做 schema / 长度 / 唯一性 / 数量校验。
do $meta$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_data_pack_metadata_shape'
  ) then
    alter table public.rooms
      add constraint rooms_data_pack_metadata_shape
      check (data_pack_metadata is null or jsonb_typeof(data_pack_metadata) = 'object');
  end if;
end $meta$;

-- create_room_transaction：追加可选元信息参数（其余逻辑与 0001 完全一致）
create or replace function public.create_room_transaction(
  p_user_id uuid,
  p_seat text,
  p_display_name text,
  p_match_state jsonb,
  p_pool jsonb,
  p_data_pack_metadata jsonb default null
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
      insert into public.rooms (code, host_user_id, status, match_state, pool, data_pack_metadata)
      values (v_code, p_user_id, 'WAITING', p_match_state, p_pool, p_data_pack_metadata)
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

-- 函数签名从 5 参变为 6 参（默认参数）：重新对齐权限
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb) from anon;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
