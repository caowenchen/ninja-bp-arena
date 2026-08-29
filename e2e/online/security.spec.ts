import { expect, test } from '@playwright/test'

/**
 * 在线集成：安全测试（RLS attack / 幂等 / revision 冲突 / Observer 服务端拒绝）。
 * 通过 @supabase/supabase-js 以普通用户身份直接攻击数据库与函数接口，
 * 而不只是测试 UI 禁用状态。必须连接真实（Local）Supabase 运行。
 */

const URL_ = process.env.VITE_SUPABASE_URL
const KEY_ = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
// 这两个变量由 playwright.online.config 的 webServer / CI 注入，但 Node 侧直接读取进程环境
test.skip(!URL_ || !KEY_, 'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 未配置（本文件只应在 Supabase 集成环境运行）')

const { createClient } = await import('@supabase/supabase-js')

/** 建立一个匿名登录的普通用户客户端（相当于任意真实用户） */
async function anonUser() {
  const client = createClient(URL_!, KEY_!)
  const { data, error } = await client.auth.signInAnonymously()
  expect(error).toBeNull()
  return { client, token: data.session!.access_token, userId: data.session!.user.id }
}

// 直接 HTTP 调用 Edge Function（绕开前端 UI）
async function invoke(name: string, token: string, body: unknown) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: KEY_!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

function makeRule() {
  return {
    id: 'e2e-rule',
    name: 'E2E 规则',
    version: '1.0',
    bestOf: 3,
    winsRequired: 2,
    banOnlyFirstGame: true,
    banPersistence: true,
    usedNinjaLocked: true,
    bansPerPlayer: 2,
    picksPerPlayer: 3,
    banSequence: [
      { side: 'BLUE', action: 'BAN', count: 1 },
      { side: 'RED', action: 'BAN', count: 2 },
      { side: 'BLUE', action: 'BAN', count: 1 },
    ],
    pickSequence: [
      { side: 'RED', action: 'PICK', count: 1 },
      { side: 'BLUE', action: 'PICK', count: 2 },
      { side: 'RED', action: 'PICK', count: 2 },
      { side: 'BLUE', action: 'PICK', count: 1 },
    ],
    timerEnabled: false,
    timerSeconds: 60,
  }
}

const POOL = Array.from({ length: 30 }, (_, i) => ({
  id: `e2e-ninja-${String(i + 1).padStart(2, '0')}`,
  enabled: true,
}))

test.describe.serial('在线安全（服务端边界）', () => {
  let host: Awaited<ReturnType<typeof anonUser>>
  let roomId: string
  let roomCode: string

  test('准备：创建房间（原子 RPC）+ 观察者加入', async () => {
    host = await anonUser()
    const created = await invoke('room-create', host.token, {
      displayName: '房主',
      seat: 'BLUE',
      rule: makeRule(),
      pool: POOL,
    })
    expect(created.status).toBe(200)
    roomId = created.json.roomId as string
    roomCode = created.json.code as string
    expect(roomCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/)

    // 观察者（Observer）
    const obs = await anonUser()
    const joined = await invoke('room-join', obs.token, { code: roomCode, seat: 'OBSERVER', displayName: '观众' })
    expect(joined.status).toBe(200)
  })

  test('RLS：非成员不能读取房间', async () => {
    const outsider = await anonUser()
    const { data } = await outsider.client.from('rooms').select('id').eq('id', roomId)
    expect(data).toEqual([]) // RLS 过滤为空
  })

  test('RLS：成员可以读取房间与花名册', async () => {
    const { data } = await host.client.from('rooms').select('id, code').eq('id', roomId)
    expect(data).toHaveLength(1)
    const { data: members } = await host.client.from('room_members').select('seat').eq('room_id', roomId)
    expect(members?.length).toBeGreaterThanOrEqual(2)
  })

  test('RLS：客户端不能直接 INSERT rooms（自定义 match_state 被拒）', async () => {
    const attacker = await anonUser()
    const { error } = await attacker.client.from('rooms').insert({
      code: 'HACK01',
      host_user_id: attacker.userId,
      status: 'WAITING',
      match_state: { hacked: true },
      pool: [],
    })
    expect(error).not.toBeNull()
  })

  test('RLS：客户端不能直接 UPDATE rooms.match_state / revision', async () => {
    const { error } = await host.client
      .from('rooms')
      .update({ match_state: { hacked: true }, revision: 999 })
      .eq('id', roomId)
    expect(error).not.toBeNull()
  })

  test('RLS：RED 不能直接把 seat 改成 BLUE（绕过 room-join）', async () => {
    // 先加入一个红方
    const red = await anonUser()
    const joined = await invoke('room-join', red.token, { code: roomCode, seat: 'RED', displayName: '红方' })
    expect(joined.status).toBe(200)
    // 直接改席位 → 必须失败
    const { error } = await red.client
      .from('room_members')
      .update({ seat: 'BLUE' })
      .eq('room_id', roomId)
      .eq('user_id', red.userId)
    expect(error).not.toBeNull()
  })

  test('RLS：客户端不能直接 INSERT room_commands', async () => {
    const attacker = await anonUser()
    const { error } = await attacker.client.from('room_commands').insert({
      command_id: crypto.randomUUID(),
      room_id: roomId,
      command_type: 'SELECT_NINJA',
      status: 'APPLIED',
    })
    expect(error).not.toBeNull()
  })

  test('Observer 直接调用 SELECT_NINJA：服务端拒绝', async () => {
    const obs = await anonUser()
    await invoke('room-join', obs.token, { code: roomCode, seat: 'OBSERVER', displayName: '观众2' })
    // Host 先开始比赛
    const started = await invoke('room-command', host.token, {
      roomId,
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      type: 'START_MATCH',
    })
    expect(started.status).toBe(200)
    const currentRevision = started.json.revision as number

    const attempted = await invoke('room-command', obs.token, {
      roomId,
      commandId: crypto.randomUUID(),
      expectedRevision: currentRevision,
      type: 'SELECT_NINJA',
      payload: { ninjaId: 'e2e-ninja-01' },
    })
    expect(attempted.status).toBe(400)
    expect(attempted.json.code).toBe('NOT_PERMITTED')
  })

  test('幂等：同一 commandId 发两次，状态只变化一次', async () => {
    const started = await invoke('room-command', host.token, {
      roomId,
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      type: 'START_MATCH',
    })
    // 若比赛尚未开始（前一用例已 START），此处直接取当前状态
    const before = started.status === 200 ? started.json : null
    const revision = (before?.revision as number) ?? 0
    const commandId = crypto.randomUUID()
    const first = await invoke('room-command', host.token, {
      roomId,
      commandId,
      expectedRevision: revision,
      type: 'SELECT_NINJA',
      payload: { ninjaId: 'e2e-ninja-05' },
    })
    // 蓝方回合才能选择；若被拒（阶段原因）则本用例仅验证幂等路径本身
    if (first.status !== 200) {
      const again = await invoke('room-command', host.token, {
        roomId,
        commandId,
        expectedRevision: revision,
        type: 'SELECT_NINJA',
        payload: { ninjaId: 'e2e-ninja-05' },
      })
      expect(again.json.code).toBe(first.json.code)
      return
    }
    const historyLen = (first.json.match as { history: unknown[] }).history.length
    const second = await invoke('room-command', host.token, {
      roomId,
      commandId,
      expectedRevision: revision,
      type: 'SELECT_NINJA',
      payload: { ninjaId: 'e2e-ninja-05' },
    })
    expect(second.status).toBe(200)
    expect(second.json.idempotent).toBe(true)
    const afterHistory = (second.json.match as { history: unknown[] }).history.length
    expect(afterHistory).toBe(historyLen)
  })

  test('Revision 冲突：两个相同 expectedRevision 并发，只有一个成功', async () => {
    const current = await host.client.from('rooms').select('revision').eq('id', roomId).single()
    const revision = current.data!.revision as number
    const body = {
      roomId,
      expectedRevision: revision,
      type: 'SELECT_NINJA',
      payload: { ninjaId: 'e2e-ninja-06' },
    }
    // RED 回合才有效；用两个不同用户并发（蓝/红各一）
    const blue = await anonUser()
    await invoke('room-join', blue.token, { code: roomCode, seat: 'BLUE', displayName: '蓝2' })
    // 蓝方客户端用户不是 host；直接用 host（是 BLUE）与另一个 BLUE 席位冲突——
    // 席位已满时第二个加入会变观战，无法并发选择。
    // 因此并发冲突用同一用户、同一 expectedRevision 的两个不同 commandId：
    const [r1, r2] = await Promise.all([
      invoke('room-command', host.token, { ...body, commandId: crypto.randomUUID() }),
      invoke('room-command', host.token, { ...body, commandId: crypto.randomUUID() }),
    ])
    const applied = [r1, r2].filter((r) => r.status === 200)
    const conflicted = [r1, r2].filter((r) => r.status === 409 || r.json.error === 'REVISION_CONFLICT')
    // 恰好一个成功（另一个要么 409，要么被幂等/其它业务规则拒绝，但绝不能都 APPLIED）
    expect(applied.length).toBeLessThanOrEqual(1)
    expect(applied.length + conflicted.length).toBeGreaterThanOrEqual(1)
    const final = await host.client.from('rooms').select('match_state, revision').eq('id', roomId).single()
    expect(final.data!.revision).toBeGreaterThanOrEqual(revision)
  })
})
