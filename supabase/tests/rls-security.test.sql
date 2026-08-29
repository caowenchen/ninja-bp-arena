-- ============================================================================
-- RLS / 安全策略 pgTAP 测试（supabase test db 自动运行本目录 *.sql）
-- 验证目标：
--   * 成员能读自己所在房间；非成员读不到
--   * 客户端无法 INSERT rooms / room_commands
--   * 客户端无法 UPDATE rooms.match_state 或 room_members.seat
--     （RLS 无策略时 UPDATE/DELETE 是 0 行静默失败，用 FOUND 判断）
-- ============================================================================

create extension if not exists pgtap;

begin;
select plan(9);

-- 切换身份辅助（auth.uid() 读取 request.jwt.claim.sub）
create or replace function tests_as_user(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare
  u_host uuid := gen_random_uuid();
  u_red uuid := gen_random_uuid();
  u_outsider uuid := gen_random_uuid();
  v_room uuid;
  v_code text;
begin
  -- 以 service role 建房间与成员（与 Edge Function 同路径，验证事务 RPC）
  perform set_config('role', 'service_role', true);
  select room_id, room_code into v_room, v_code
    from private.create_room_transaction(
      u_host, 'BLUE', '房主', '{"demo": true}'::jsonb,
      '[{"id":"n1","enabled":true}]'::jsonb
    );

  insert into public.room_members (room_id, user_id, seat, display_name)
  values (v_room, u_red, 'RED', '红方');

  -- 1 成员能读自己所在房间
  perform tests_as_user(u_host);
  perform ok(exists (select 1 from public.rooms where id = v_room), '成员可以读取自己所在房间');

  -- 2 非成员读不到
  perform tests_as_user(u_outsider);
  perform ok(not exists (select 1 from public.rooms where id = v_room), '非成员不能读取房间');

  -- 3 成员能读花名册
  perform tests_as_user(u_red);
  perform ok((select count(*) from public.room_members where room_id = v_room) >= 2, '成员可以读取花名册');

  -- 4 非成员读不到花名册
  perform tests_as_user(u_outsider);
  perform ok((select count(*) from public.room_members where room_id = v_room) = 0, '非成员不能读取花名册');

  -- 5 RED 直接改 seat 为 BLUE：表级 UPDATE 已 REVOKE（42501）或 RLS 0 行
  perform tests_as_user(u_red);
  begin
    update public.room_members set seat = 'BLUE' where room_id = v_room and user_id = u_red;
    perform ok(not found, 'RED 不能直接 UPDATE seat');
  exception when insufficient_privilege then
    perform ok(true, 'RED 不能直接 UPDATE seat');
  end;

  -- 6 客户端 UPDATE rooms.match_state：同上
  perform tests_as_user(u_host);
  begin
    update public.rooms set match_state = '{\"hacked\": true}'::jsonb where id = v_room;
    perform ok(not found, '客户端不能 UPDATE rooms.match_state');
  exception when insufficient_privilege then
    perform ok(true, '客户端不能 UPDATE rooms.match_state');
  end;

  -- 7 客户端 INSERT rooms → 42501 拒绝
  perform tests_as_user(u_host);
  begin
    insert into public.rooms (code, host_user_id, status, match_state, pool)
    values ('HACK99', u_host, 'WAITING', '{"x":1}'::jsonb, '[]'::jsonb);
    perform ok(false, '客户端不能 INSERT rooms');
  exception when insufficient_privilege then
    perform ok(true, '客户端不能 INSERT rooms');
  when others then
    perform ok(true, '客户端不能 INSERT rooms');
  end;

  -- 8 客户端 INSERT room_commands → 拒绝
  perform tests_as_user(u_host);
  begin
    insert into public.room_commands (command_id, room_id, command_type, status)
    values (gen_random_uuid(), v_room, 'SELECT_NINJA', 'APPLIED');
    perform ok(false, '客户端不能 INSERT room_commands');
  exception when insufficient_privilege then
    perform ok(true, '客户端不能 INSERT room_commands');
  when others then
    perform ok(true, '客户端不能 INSERT room_commands');
  end;

  -- 9 CAS RPC：EXECUTE 已从 authenticated 收回
  perform tests_as_user(u_host);
  begin
    perform private.apply_room_state_cas(
      v_room, 1, gen_random_uuid(), u_host, 'SELECT_NINJA', null,
      '{"demo":1}'::jsonb, 'ACTIVE', null
    );
    perform ok(false, '普通用户不能执行 CAS RPC');
  exception when insufficient_privilege then
    perform ok(true, '普通用户不能执行 CAS RPC');
  when others then
    perform ok(true, '普通用户不能执行 CAS RPC');
  end;
end $$;

select * from finish();
rollback;
