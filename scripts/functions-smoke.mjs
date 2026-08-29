/**
 * Edge Functions 冒烟测试（真实 HTTP 调用，针对 Supabase Local）。
 *
 * 覆盖：
 * 1. room-create（匿名登录 → 原子创建 → 房间码格式）
 * 2. room-join（第二玩家加入 + 重复加入幂等）
 * 3. room-command START_MATCH（Host 权限 + 服务端填充玩家名 + revision +1）
 * 4. 非成员直接读房间 → RLS 空结果
 *
 * 环境变量：SUPABASE_URL / SUPABASE_ANON_KEY（由 CI 从 supabase status 注入）
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY
if (!anonKey) {
  console.error('缺少 SUPABASE_ANON_KEY')
  process.exit(1)
}

function rule() {
  return {
    id: 'smoke-rule',
    name: '冒烟规则',
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

const POOL = Array.from({ length: 26 }, (_, i) => ({
  id: `smoke-ninja-${String(i + 1).padStart(2, '0')}`,
  enabled: true,
}))

async function newUser() {
  const client = createClient(url, anonKey)
  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw new Error(`匿名登录失败: ${error.message}`)
  return { client, token: data.session.access_token, userId: data.session.user.id }
}

async function invoke(token, name, body) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`✗ ${msg}`)
    process.exit(1)
  }
  console.log(`✓ ${msg}`)
}

const host = await newUser()
const created = await invoke(host.token, 'room-create', {
  displayName: '冒烟房主',
  seat: 'BLUE',
  rule: rule(),
  pool: POOL,
})
assert(created.status === 200, `room-create 返回 200（code=${created.json.code ?? created.json.message}）`)
assert(/^[A-HJ-KM-NP-Z2-9]{6}$/.test(created.json.code), '房间码为 6 位无混淆字符')
const roomId = created.json.roomId
const code = created.json.code

// 非成员读取 → RLS 空结果
const outsider = await newUser()
const peek = await outsider.client.from('rooms').select('id').eq('id', roomId)
assert(peek.data && peek.data.length === 0, 'RLS：非成员读取房间为空')

// 玩家加入 + 幂等重连
const red = await newUser()
const joined = await invoke(red.token, 'room-join', { code, seat: 'RED', displayName: '冒烟红方' })
assert(joined.status === 200 && joined.json.seat === 'RED', 'room-join 红方加入成功')
const rejoined = await invoke(red.token, 'room-join', { code, seat: 'BLUE', displayName: '冒烟红方' })
assert(rejoined.status === 200 && rejoined.json.rejoined === true && rejoined.json.seat === 'RED', '重复加入幂等返回原席位')

// Host START_MATCH → 服务端填充名字 + revision +1
const started = await invoke(host.token, 'room-command', {
  roomId,
  commandId: crypto.randomUUID(),
  expectedRevision: 0,
  type: 'START_MATCH',
})
assert(started.status === 200, `START_MATCH 成功（${started.json.message ?? ''}）`)
assert(started.json.revision === 1, 'revision 从 0 → 1')
const m = started.json.match
assert(m.bluePlayerName === '冒烟房主' && m.redPlayerName === '冒烟红方', '玩家名称由服务端从成员表填充')

// 非 Host START_MATCH 被拒（重复开始）
const again = await invoke(red.token, 'room-command', {
  roomId,
  commandId: crypto.randomUUID(),
  expectedRevision: started.json.revision,
  type: 'START_MATCH',
})
assert(again.status === 400 && again.json.code === 'NOT_HOST', '非房主 START_MATCH 被拒绝 NOT_HOST')

// 回合权限：START 后是蓝方 Ban 回合，红方选择被拒
const wrongTurn = await invoke(red.token, 'room-command', {
  roomId,
  commandId: crypto.randomUUID(),
  expectedRevision: started.json.revision,
  type: 'SELECT_NINJA',
  payload: { ninjaId: 'smoke-ninja-01' },
})
assert(wrongTurn.status === 400 && wrongTurn.json.code === 'NOT_YOUR_TURN', '红方在蓝方回合被拒 NOT_YOUR_TURN')

console.log('\nEdge Functions 冒烟测试全部通过')
