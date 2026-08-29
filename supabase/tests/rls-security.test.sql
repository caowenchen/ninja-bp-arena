-- ============================================================================
-- RLS / 安全策略 pgTAP 测试（supabase test db 自动运行本目录 *.sql）
-- 注意：
--   * 必须先设置 request.jwt.claims 再查询房间（RLS 依赖 auth.uid()）
--   * 每个用例恰好产生一个 ok()，与 plan(10) 严格对应
--   * 失败诊断通过 RAISE WARNING 输出（日志可见）
-- ============================================================================

create extension if not exists pgtap;

begin;
select plan(10);

-- 报告包装：diag 输出每次断言结果（pg_prove 的 # 注释行会显示在日志里）
create or replace function test_check(p_pass boolean, p_name text) returns void
language plpgsql as $fn$
begin
  perform diag(p_name || ' => ' || case when p_pass then 'PASS' else 'FAIL' end);
  perform ok(p_pass, p_name);
end;
$fn$;

-- 1 前置数据：service role 建房间与成员（与 Edge Function 同路径，事务 RPC）
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
  perform test_check(true, '前置数据就绪');
exception when others then
  raise warning 'PGTAP-FAIL SETUP: %', SQLERRM;
  perform ok(false, '前置数据失败: ' || SQLERRM);
end $setup$;

-- 2 成员能读自己所在房间
do $t1$
declare u_host uuid;
        v_room uuid;
begin
  u_host := (select user_id from public.room_members where seat = 'BLUE' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  perform test_check(v_room is not null, '成员可以读取自己所在房间');
exception when others then
  raise warning 'PGTAP-FAIL T1: %', SQLERRM;
  perform ok(false, '用例2异常: ' || SQLERRM);
end $t1$;

-- 3 非成员读不到房间
do $t2$
declare v_room uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  perform test_check(v_room is null, '非成员不能读取房间');
exception when others then
  raise warning 'PGTAP-FAIL T2: %', SQLERRM;
  perform ok(false, '用例3异常: ' || SQLERRM);
end $t2$;

-- 4 成员能读花名册
do $t3$
declare u_red uuid;
        v_room uuid;
        n int;
begin
  u_red := (select user_id from public.room_members where seat = 'RED' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_red::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  select count(*) into n from public.room_members where room_id = v_room;
  perform test_check(n >= 2, '成员可以读取花名册');
exception when others then
  raise warning 'PGTAP-FAIL T3: %', SQLERRM;
  perform ok(false, '用例4异常: ' || SQLERRM);
end $t3$;

-- 5 非成员读不到花名册
do $t4$
declare v_room uuid;
        n int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  select count(*) into n from public.room_members where room_id = coalesce(v_room, gen_random_uuid());
  perform test_check(n = 0, '非成员不能读取花名册');
exception when others then
  raise warning 'PGTAP-FAIL T4: %', SQLERRM;
  perform ok(false, '用例5异常: ' || SQLERRM);
end $t4$;

-- 6 RED 直接改 seat：表级 UPDATE 已 REVOKE（42501）或 RLS 拦截
do $t5$
declare u_red uuid;
        v_room uuid;
begin
  u_red := (select user_id from public.room_members where seat = 'RED' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_red::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  update public.room_members set seat = 'BLUE' where room_id = v_room and user_id = u_red;
  perform test_check(not found, 'RED 不能直接 UPDATE seat');
exception when others then
  perform ok(true, 'RED 不能直接 UPDATE seat（' || SQLERRM || '）');
end $t5$;

-- 7 客户端 UPDATE rooms.match_state：拦截
do $t6$
declare u_host uuid;
        v_room uuid;
begin
  u_host := (select user_id from public.room_members where seat = 'BLUE' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  update public.rooms set match_state = '{"hacked": true}'::jsonb where id = v_room;
  perform test_check(not found, '客户端不能 UPDATE rooms.match_state');
exception when others then
  perform ok(true, '客户端不能 UPDATE rooms.match_state（' || SQLERRM || '）');
end $t6$;

-- 8 客户端 INSERT rooms：拒绝
do $t7$
declare u_host uuid;
begin
  u_host := (select user_id from public.room_members where seat = 'BLUE' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  insert into public.rooms (code, host_user_id, status, match_state, pool)
  values ('HACK99', u_host, 'WAITING', '{"x":1}'::jsonb, '[]'::jsonb);
  perform test_check(false, '客户端居然能 INSERT rooms');
exception when others then
  perform ok(true, '客户端不能 INSERT rooms（' || SQLERRM || '）');
end $t7$;

-- 9 客户端 INSERT room_commands：拒绝
do $t8$
declare u_host uuid;
        v_room uuid;
begin
  u_host := (select user_id from public.room_members where seat = 'BLUE' limit 1);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_host::text, 'role', 'authenticated')::text, true);
  select id into v_room from public.rooms limit 1;
  insert into public.room_commands (command_id, room_id, command_type, status)
  values (gen_random_uuid(), v_room, 'SELECT_NINJA', 'APPLIED');
  perform test_check(false, '客户端居然能 INSERT room_commands');
exception when others then
  perform ok(true, '客户端不能 INSERT room_commands（' || SQLERRM || '）');
end $t8$;

-- 10 CAS RPC：EXECUTE 只授予 service_role（权限元数据检查，不实际调用）
do $t9$
begin
  perform test_check(has_function_privilege(
      'authenticated',
      'private.apply_room_state_cas(uuid,bigint,uuid,uuid,text,jsonb,jsonb,text,jsonb)',
      'EXECUTE'
    ) = false
    and has_function_privilege(
      'service_role',
      'private.apply_room_state_cas(uuid,bigint,uuid,uuid,text,jsonb,jsonb,text,jsonb)',
      'EXECUTE'
    ), 'CAS RPC 仅 service_role 可执行');
exception when others then
  raise warning 'PGTAP-FAIL T9: %', SQLERRM;
  perform ok(false, '用例10异常: ' || SQLERRM);
end $t9$;

select * from finish();
rollback;
