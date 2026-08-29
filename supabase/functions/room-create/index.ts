import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'
import { createMatch, validateBattleRule, type BattleRule } from '../../shared/bp-core/index.ts'

/**
 * POST /functions/v1/room-create
 * 创建在线 BP 房间（服务端生成房间码，创建者入座所选阵营）。
 * body: { displayName: string, seat: 'BLUE' | 'RED', rule: BattleRule }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '请先进入在线模式' }, 401)

    const body = await req.json().catch(() => null)
    const displayName = String(body?.displayName ?? '').trim()
    const seat = body?.seat
    const rule = body?.rule as BattleRule | undefined

    if (displayName.length < 1 || displayName.length > 20) {
      return json({ error: 'INVALID_DISPLAY_NAME', message: '显示名称需要 1~20 个字符' }, 400)
    }
    if (seat !== 'BLUE' && seat !== 'RED') {
      return json({ error: 'INVALID_SEAT', message: '创建房间需要选择阵营' }, 400)
    }
    if (!rule) return json({ error: 'INVALID_RULE', message: '缺少规则模板' }, 400)
    const ruleErrors = validateBattleRule(rule)
    if (ruleErrors.length > 0) {
      return json({ error: 'INVALID_RULE', message: ruleErrors.join('；') }, 400)
    }

    // 忍者池快照：服务端只保留 {id, enabled}（SELECT_NINJA 校验用），
    // 创建时固化，与本地模式的“开赛后池子即快照”语义一致
    const rawPool = Array.isArray(body?.pool) ? body.pool : []
    if (rawPool.length > 2000) {
      return json({ error: 'POOL_TOO_LARGE', message: '忍者池过大' }, 400)
    }
    const pool = rawPool
      .filter((n: unknown) => typeof n === 'object' && n !== null && typeof (n as { id?: unknown }).id === 'string')
      .map((n: { id: string; enabled?: unknown }) => ({ id: n.id, enabled: n.enabled !== false }))

    // 初始权威状态：SETUP 场次（START_MATCH 命令才会正式开始）
    const match = createMatch(rule, seat === 'BLUE' ? displayName : '', seat === 'RED' ? displayName : '')

    // 房间码：6 位，避开混淆字符；唯一冲突自动重试
    const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let roomId: string | null = null
    let code = ''
    for (let attempt = 0; attempt < 6; attempt += 1) {
      code = Array.from({ length: 6 }, () => charset[Math.floor(Math.random() * charset.length)]).join('')
      const { data, error } = await admin
        .from('rooms')
        .insert({ code, host_user_id: user.id, status: 'WAITING', match_state: match, revision: 0, pool })
        .select('id')
        .single()
      if (!error && data?.id) {
        roomId = data.id as string
        break
      }
      if (error && error.code !== '23505') {
        return json({ error: 'DB_ERROR', message: error.message }, 500)
      }
      // 23505 = 唯一冲突（房间码重复）→ 换一个码重试
    }
    if (!roomId) return json({ error: 'CODE_GEN_FAILED', message: '房间码生成失败，请重试' }, 500)

    const { error: memberError } = await admin.from('room_members').insert({
      room_id: roomId,
      user_id: user.id,
      seat,
      display_name: displayName,
    })
    if (memberError) return json({ error: 'DB_ERROR', message: memberError.message }, 500)

    return json({ roomId, code, seat })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
