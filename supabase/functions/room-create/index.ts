import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'
import { createMatch, validateStoredRule, type BattleRule } from '../_shared/bp-core/index.ts'

/**
 * POST /functions/v1/room-create
 * 创建在线 BP 房间（房间码由数据库 RPC 用加密学随机源生成，
 * 房间 + 房主入座在同一个事务内完成，不会留下孤儿房间）。
 *
 * body: { displayName: string, seat: 'BLUE' | 'RED', rule: BattleRule, pool: {id,enabled}[] }
 */
const MAX_BODY_BYTES = 256 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '请先进入在线模式' }, 401)

    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ error: 'PAYLOAD_TOO_LARGE', message: '请求体积超出限制' }, 413)
    }
    const body = JSON.parse(rawBody) as {
      displayName?: unknown
      seat?: unknown
      rule?: unknown
      pool?: unknown
    }

    const displayName = String(body.displayName ?? '').trim()
    const seat = body.seat
    const rule = body.rule as BattleRule | undefined

    if (displayName.length < 1 || displayName.length > 20) {
      return json({ error: 'INVALID_DISPLAY_NAME', message: '显示名称需要 1~20 个字符' }, 400)
    }
    if (seat !== 'BLUE' && seat !== 'RED') {
      return json({ error: 'INVALID_SEAT', message: '创建房间需要选择阵营' }, 400)
    }
    // 运行时结构校验（结构 + 业务规则双重），不做裸 as 断言
    if (!rule || !validateStoredRule(rule)) {
      return json({ error: 'INVALID_RULE', message: '规则模板不合法' }, 400)
    }

    // 忍者池快照：只保留 {id, enabled}；去重、限长、限量
    const rawPool = Array.isArray(body.pool) ? body.pool : []
    if (rawPool.length > 2000) {
      return json({ error: 'POOL_TOO_LARGE', message: '忍者池条目过多（最多 2000）' }, 400)
    }
    const seenIds = new Set<string>()
    const pool: { id: string; enabled: boolean }[] = []
    for (const item of rawPool) {
      const rec = item as { id?: unknown; enabled?: unknown }
      const id = typeof rec?.id === 'string' ? rec.id : ''
      if (id.length < 1 || id.length > 100 || seenIds.has(id)) continue
      seenIds.add(id)
      pool.push({ id, enabled: rec.enabled !== false })
    }

    // 初始权威状态：SETUP 场次（START_MATCH 命令才会正式开始并填充玩家名）
    const match = createMatch(rule, seat === 'BLUE' ? displayName : '', seat === 'RED' ? displayName : '')

    // 原子创建：房间 + 房主入座（任一失败整体回滚）
    const { data, error: rpcError } = await admin.rpc('create_room_transaction', {
      p_user_id: user.id,
      p_seat: seat,
      p_display_name: displayName,
      p_match_state: match,
      p_pool: pool,
    })
    if (rpcError || !data || !data[0]) {
      const message = rpcError?.message ?? '创建失败'
      if (message.includes('INVALID_POOL')) return json({ error: 'POOL_TOO_LARGE', message: '忍者池不合法' }, 400)
      return json({ error: 'DB_ERROR', message }, 500)
    }

    return json({ roomId: data[0].room_id as string, code: data[0].room_code as string, seat })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
