-- ============================================================================
-- RLS / 安全策略 pgTAP 测试（supabase test db 自动运行本目录 *.sql）
-- 验证目标：
--   * 成员能读自己所在房间；非成员读不到
--   * 客户端无法 INSERT rooms / room_commands
--   * 客户端无法 UPDATE rooms.match_state 或 room_members.seat
-- ============================================================================

begin;
select plan(9);

-- 构造三个测试身份（auth.uid() 读取 request.jwt.claim.sub）
create or replace function tests_as_user(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

create extension if not exists pgtap;

do $$
declare
  u_host uuid := gen_random_uuid();
  u_red uuid := gen_random_uuid();
  u_outsider uuid := gen_random_uuid();
  v_room uuid;
  v_code text;
  v_rule jsonb := jsonb_build_object(
    'id', 'test-rule', 'name', 'T', 'version', '1',
    'bestOf', 3, 'winsRequired', 2,
    'banOnlyFirstGame', true, 'banPersistence', true, 'usedNinjaLocked', true,
    'bansPerPlayer', 2, 'picksPerPlayer', 3,
    'banSequence', '[]'::jsonb, 'pickSequence', '[]'::jsonb,
    'timerEnabled', false, 'timerSeconds', 60
  );
begin
  -- 以 service role 建房间与成员（与 Edge Function 同路径）
  perform set_config('role', 'service_role', true);
  select room_id, room_code into v_room, v_code
    from private.create_room_transaction(u_host, 'BLUE', '房主', '{"demo": true}'::jsonb, '[{"id":"n1","enabled":true}]'::jsonb);
  insert into public.room_members (room_id, user_id, seat, display_name) values (v_room, u_red, 'RED', '红方');

  -- 1 成员能读自己所在房间
  perform tests_as_user(u_host);
  ok(exists (select 1 from public.rooms where id = v_room), '成员可以读取自己所在房间');

  -- 2 非成员读不到
  perform tests_as_user(u_outsider);
  ok(not exists (select 1 from public.rooms where id = v_room), '非成员不能读取房间');

  -- 3 成员能读花名册
  perform tests_as_user(u_red);
  ok((select count(*) from public.room_members where room_id = v_room) >= 2, '成员可以读取花名册');

  -- 4 非成员读不到花名册
  perform tests_as_user(u_outsider);
  ok((select count(*) from public.room_members where room_id = v_room) = 0, '非成员不能读取花名册');

  -- 5 RED 不能直接改自己的 seat 为 BLUE
  perform tests_as_user(u_red);
  begin
    update public.room_members set seat = 'BLUE' where room_id = v_room and user_id = u_red;
    ok(false, 'RED 不能直接 UPDATE seat');
  exception when insufficient_privilege then
    ok(true, 'RED 不能直接 UPDATE seat');
  when others then
    ok(true, 'RED 不能直接 UPDATE seat');
  end;

  -- 6 客户端不能 UPDATE rooms.match_state
  perform tests_as_user(u_host);
  begin
    update public.rooms set match_state = '{"hacked": true}'::jsonb where id = v_room;
    ok(false, '客户端不能 UPDATE rooms.match_state');
  exception when insufficient_privilege then
    ok(true, '客户端不能 UPDATE rooms.match_state');
  when others then
    ok(true, '客户端不能 UPDATE rooms.match_state');
  end;

  -- 7 客户端不能 INSERT rooms
  perform tests_as_user(u_host);
  begin
    insert into public.rooms (code, host_user_id, status, match_state, pool)
    values ('HACK99', u_host, 'WAITING', '{"x":1}'::jsonb, '[]'::jsonb);
    ok(false, '客户端不能 INSERT rooms');
  exception when insufficient_privilege then
    ok(true, '客户端不能 INSERT rooms');
  when others then
    ok(true, '客户端不能 INSERT rooms');
  end;

  -- 8 客户端不能 INSERT room_commands
  perform tests_as_user(u_host);
  begin
    insert into public.room_commands (command_id, room_id, command_type, status)
    values (gen_random_uuid(), v_room, 'SELECT_NINJA', 'APPLIED');
    ok(false, '客户端不能 INSERT room_commands');
  exception when insufficient_privilege then
    ok(true, '客户端不能 INSERT room_commands');
  when others then
    ok(true, '客户端不能 INSERT room_commands');
  end;

  -- 9 CAS RPC：只有 service role 能执行
  perform tests_as_user(u_host);
  begin
    perform private.apply_room_state_cas(v_room, 1, gen_random_uuid(), u_host, 'SELECT_NINJA', null, '{"demo":1}'::jsonb, 'ACTIVE', null);
    ok(false, '普通用户不能执行 CAS RPC');
  exception when insufficient_privilege then
    ok(true, '普通用户不能执行 CAS RPC');
  when others then
    ok(true, '普通用户不能执行 CAS RPC');
  end;
end $$;

select * from finish();
rollback;
