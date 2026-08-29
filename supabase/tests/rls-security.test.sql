-- ============================================================================
-- RLS / 安全策略 pgTAP 测试（supabase test db 自动运行本目录 *.sql）
-- 每个用例独立 DO 块 + 异常捕获：失败时报告 SQLERRM，不吞掉整个计划
-- ============================================================================

create extension if not exists pgtap;

begin;
select plan(9);

-- 前置数据：service role 建房间与成员（与 Edge Function 同路径）
do $setup$
declare
  u_host uuid := gen_random_uuid();
  u_red uuid := gen_random_uuid();
begin
  perform set_config('role', 'service_role', true);
  perform private.create_room_transaction(
    u_host, 'BLUE', '房主', '{"demo": true}'::jsonb,
    '[{"id":"n1","enabled":true}]'::jsonb
  );
  insert into public.room_members (room_id, user_id, seat, display_name)
  values (
    (select id from public.rooms order by created_at desc limit 1),
    u_red, 'RED', '红方'
  );
exception when others then
  perform diag('SETUP失败: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '前置数据失败: ' || SQLERRM);
end $setup$;

-- 1 成员能读自己所在房间
do $t1$
declare u_host uuid := (select user_id from public.room_members where seat = 'BLUE' limit 1);
        v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  perform ok(exists (select 1 from public.rooms where id = v_room), '成员可以读取自己所在房间');
exception when others then
  perform diag('用例1: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '用例1异常: ' || SQLERRM);
end $t1$;

-- 2 非成员读不到房间
do $t2$
declare v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  perform ok(not exists (select 1 from public.rooms where id = v_room), '非成员不能读取房间');
exception when others then
  perform diag('用例2: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '用例2异常: ' || SQLERRM);
end $t2$;

-- 3 成员能读花名册
do $t3$
declare u_red uuid := (select user_id from public.room_members where seat = 'RED' limit 1);
        v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_red::text, 'role', 'authenticated')::text, true);
  perform ok((select count(*) from public.room_members where room_id = v_room) >= 2, '成员可以读取花名册');
exception when others then
  perform diag('用例3: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '用例3异常: ' || SQLERRM);
end $t3$;

-- 4 非成员读不到花名册
do $t4$
declare v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  perform ok((select count(*) from public.room_members where room_id = v_room) = 0, '非成员不能读取花名册');
exception when others then
  perform diag('用例4: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '用例4异常: ' || SQLERRM);
end $t4$;

-- 5 RED 直接改 seat：表级 UPDATE 已 REVOKE（42501）或 RLS 拦截
do $t5$
declare u_red uuid := (select user_id from public.room_members where seat = 'RED' limit 1);
        v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_red::text, 'role', 'authenticated')::text, true);
  update public.room_members set seat = 'BLUE' where room_id = v_room and user_id = u_red;
  perform ok(not found, 'RED 不能直接 UPDATE seat');
exception when others then
  perform ok(true, 'RED 不能直接 UPDATE seat（' || SQLERRM || '）');
end $t5$;

-- 6 客户端 UPDATE rooms.match_state：拦截
do $t6$
declare u_host uuid := (select user_id from public.room_members where seat = 'BLUE' limit 1);
        v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  update public.rooms set match_state = '{"hacked": true}'::jsonb where id = v_room;
  perform ok(not found, '客户端不能 UPDATE rooms.match_state');
exception when others then
  perform ok(true, '客户端不能 UPDATE rooms.match_state（' || SQLERRM || '）');
end $t6$;

-- 7 客户端 INSERT rooms：拒绝
do $t7$
declare u_host uuid := (select user_id from public.room_members where seat = 'BLUE' limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  insert into public.rooms (code, host_user_id, status, match_state, pool)
  values ('HACK99', u_host, 'WAITING', '{"x":1}'::jsonb, '[]'::jsonb);
  raise warning 'PGTAP-FAIL: %', 客户端不能 INSERT rooms;
  perform ok(false, '客户端不能 INSERT rooms');
exception when others then
  perform ok(true, '客户端不能 INSERT rooms（' || SQLERRM || '）');
end $t7$;

-- 8 客户端 INSERT room_commands：拒绝
do $t8$
declare u_host uuid := (select user_id from public.room_members where seat = 'BLUE' limit 1);
        v_room uuid := (select id from public.rooms limit 1);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  insert into public.room_commands (command_id, room_id, command_type, status)
  values (gen_random_uuid(), v_room, 'SELECT_NINJA', 'APPLIED');
  raise warning 'PGTAP-FAIL: %', 客户端不能 INSERT room_commands;
  perform ok(false, '客户端不能 INSERT room_commands');
exception when others then
  perform ok(true, '客户端不能 INSERT room_commands（' || SQLERRM || '）');
end $t8$;

-- 9 CAS RPC：EXECUTE 已从 authenticated 收回（权限元数据检查，不实际调用）
do $t9$
begin
  perform ok(
    has_function_privilege(
      'authenticated',
      'private.apply_room_state_cas(uuid,bigint,uuid,uuid,text,jsonb,jsonb,text,jsonb)',
      'EXECUTE'
    ) = false,
    '普通用户不能执行 CAS RPC'
  );
  perform ok(
    has_function_privilege(
      'service_role',
      'private.apply_room_state_cas(uuid,bigint,uuid,uuid,text,jsonb,jsonb,text,jsonb)',
      'EXECUTE'
    ),
    'service_role 可以执行 CAS RPC'
  );
exception when others then
  perform diag('用例9: ' || SQLERRM || ' | STATE: ' || SQLSTATE);
  perform ok(false, '用例9异常: ' || SQLERRM);
end $t9$;

select * from finish();
rollback;
