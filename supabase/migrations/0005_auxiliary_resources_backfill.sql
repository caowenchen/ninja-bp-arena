-- ============================================================================
-- v0.5.0 compatibility backfill
--
-- Stable v0.4.0 already shipped migration version 0004 under a different
-- filename. Supabase tracks the numeric version, so upgraded databases may
-- legitimately skip the new 0004_auxiliary_resources.sql. Repeat the idempotent
-- schema/function change here so both fresh installs and v0.4 upgrades converge.
-- ============================================================================

alter table public.rooms
  add column if not exists resource_snapshot jsonb;

do $snapshot$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_resource_snapshot_shape'
  ) then
    alter table public.rooms
      add constraint rooms_resource_snapshot_shape
      check (
        resource_snapshot is null
        or (
          jsonb_typeof(resource_snapshot) = 'object'
          and coalesce(jsonb_typeof(resource_snapshot->'ninjas') = 'array', false)
          and coalesce(jsonb_typeof(resource_snapshot->'secretScrolls') = 'array', false)
          and coalesce(jsonb_typeof(resource_snapshot->'summons') = 'array', false)
        )
      );
  end if;
end $snapshot$;

create or replace function public.create_room_transaction(
  p_user_id uuid,
  p_seat text,
  p_display_name text,
  p_match_state jsonb,
  p_pool jsonb,
  p_data_pack_metadata jsonb default null,
  p_resource_snapshot jsonb default null
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
  if p_seat not in ('BLUE', 'RED') then raise exception 'INVALID_SEAT'; end if;
  if char_length(p_display_name) < 1 or char_length(p_display_name) > 20 then raise exception 'INVALID_DISPLAY_NAME'; end if;
  if jsonb_typeof(p_pool) <> 'array' or jsonb_array_length(p_pool) > 2000 then raise exception 'INVALID_POOL'; end if;
  if p_resource_snapshot is not null and (
    jsonb_typeof(p_resource_snapshot) <> 'object'
    or coalesce(jsonb_typeof(p_resource_snapshot->'ninjas') <> 'array', true)
    or coalesce(jsonb_typeof(p_resource_snapshot->'secretScrolls') <> 'array', true)
    or coalesce(jsonb_typeof(p_resource_snapshot->'summons') <> 'array', true)
    or jsonb_array_length(p_resource_snapshot->'ninjas') > 500
    or jsonb_array_length(p_resource_snapshot->'secretScrolls') > 100
    or jsonb_array_length(p_resource_snapshot->'summons') > 100
    or pg_column_size(p_resource_snapshot) > 524288
  ) then raise exception 'INVALID_RESOURCE_SNAPSHOT'; end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 6 then raise exception 'CODE_GEN_FAILED'; end if;
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_charset, (get_byte(v_bytes, v_i - 1) % 31) + 1, 1);
    end loop;
    begin
      insert into public.rooms (code, host_user_id, status, match_state, pool, data_pack_metadata, resource_snapshot)
      values (v_code, p_user_id, 'WAITING', p_match_state, p_pool, p_data_pack_metadata, p_resource_snapshot)
      returning id into v_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, seat, display_name)
  values (v_id, p_user_id, p_seat, p_display_name);
  return query select v_id, v_code;
end;
$$;

revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Defaults preserve legacy callers; remove old overloads to avoid ambiguity.
drop function if exists public.create_room_transaction(uuid, text, text, jsonb, jsonb);
drop function if exists public.create_room_transaction(uuid, text, text, jsonb, jsonb, jsonb);
