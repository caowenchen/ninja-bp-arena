import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'
import {
  countEnabledResources,
  createMatch,
  getMinimumRequiredResources,
  validateOnlineResourceSnapshot,
  validateOnlineNinjaSnapshot,
  validateStoredRule,
  type BattleRule,
  type OnlineNinjaSnapshot,
  type OnlineResourceSnapshot,
  type BattleResourceSnapshot,
} from '../_shared/bp-core/index.ts'

/**
 * POST /functions/v1/room-create
 * 创建在线 BP 房间（房间码由数据库 RPC 用加密学随机源生成，
 * 房间 + 房主入座在同一个事务内完成，不会留下孤儿房间）。
 *
 * v0.4：body 可携带 `ninjas`（完整轻量忍者快照 id/name/enabled/quality/avatar/assetKey）
 * 与 `packMetadata`（数据包元信息）。快照成为房间显示权威——加入方即使本地
 * 数据包版本不同，看到的也是同一份角色数据。服务端严格校验字段长度与数量，
 * 绝不接受 data: URL（Base64 禁止入库）。
 *
 * body: { displayName, seat: 'BLUE'|'RED', rule: BattleRule, pool?: {id,enabled}[], ninjas?: OnlineNinjaSnapshot[], packMetadata?: {...} }
 */
const MAX_BODY_BYTES = 768 * 1024
const MAX_SNAPSHOT_NINJAS = 500
const MAX_SNAPSHOT_AUXILIARY = 100
// 创建房间限速：每 auth user 60 秒最多 5 个房间 / 24 小时最多 20 个
const CREATE_RATE_WINDOW_MS = 60_000
const CREATE_RATE_MAX = 5
const CREATE_DAILY_MAX = 20

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '请先进入在线模式' }, 401)

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'PAYLOAD_TOO_LARGE', message: '请求体积超出限制' }, 413)
    }
    const body = JSON.parse(rawBody) as {
      displayName?: unknown
      seat?: unknown
      rule?: unknown
      pool?: unknown
      ninjas?: unknown
      resourceSnapshot?: unknown
      packMetadata?: unknown
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

    // ---- v0.4：忍者快照（显示权威）与服务端校验 ----
    let ninjas: OnlineNinjaSnapshot[] | null = null
    if (body.ninjas !== undefined) {
      if (!Array.isArray(body.ninjas)) return json({ error: 'INVALID_NINJAS', message: 'ninjas 必须是数组' }, 400)
      if (body.ninjas.length > MAX_SNAPSHOT_NINJAS) {
        return json({ error: 'TOO_MANY_NINJAS', message: `忍者数量超出限制（最多 ${MAX_SNAPSHOT_NINJAS}）` }, 400)
      }
      const seen = new Set<string>()
      const list: OnlineNinjaSnapshot[] = []
      for (let i = 0; i < body.ninjas.length; i += 1) {
        const errors = validateOnlineNinjaSnapshot(body.ninjas[i], i)
        if (errors.length > 0) {
          return json({ error: 'INVALID_NINJAS', message: errors[0] }, 400)
        }
        const rec = body.ninjas[i] as OnlineNinjaSnapshot
        if (seen.has(rec.id)) return json({ error: 'INVALID_NINJAS', message: `忍者 ID 重复：${rec.id}` }, 400)
        seen.add(rec.id)
        list.push({
          id: rec.id,
          name: rec.name,
          enabled: rec.enabled,
          quality: rec.quality,
          ...(rec.avatar ? { avatar: rec.avatar } : {}),
          ...(rec.assetKey ? { assetKey: rec.assetKey } : {}),
        })
      }
      ninjas = list
    }

    let resourceSnapshot: BattleResourceSnapshot | null = null
    if (body.resourceSnapshot !== undefined) {
      const snapshot = body.resourceSnapshot as Partial<BattleResourceSnapshot>
      if (!snapshot || !Array.isArray(snapshot.ninjas) || !Array.isArray(snapshot.secretScrolls) || !Array.isArray(snapshot.summons)) {
        return json({ error: 'INVALID_RESOURCE_SNAPSHOT', message: 'resourceSnapshot 结构不合法' }, 400)
      }
      if (snapshot.ninjas.length > MAX_SNAPSHOT_NINJAS || snapshot.secretScrolls.length > MAX_SNAPSHOT_AUXILIARY || snapshot.summons.length > MAX_SNAPSHOT_AUXILIARY) {
        return json({ error: 'TOO_MANY_RESOURCES', message: '资源快照数量超出限制' }, 400)
      }
      const seen = new Set<string>()
      for (let i = 0; i < snapshot.ninjas.length; i += 1) {
        const errors = validateOnlineNinjaSnapshot(snapshot.ninjas[i], i)
        if (errors.length) return json({ error: 'INVALID_RESOURCE_SNAPSHOT', message: errors[0] }, 400)
      }
      for (const [items, type] of [[snapshot.secretScrolls, 'SECRET_SCROLL'], [snapshot.summons, 'SUMMON']] as const) {
        for (let i = 0; i < items.length; i += 1) {
          const errors = validateOnlineResourceSnapshot(items[i], i, type)
          if (errors.length) return json({ error: 'INVALID_RESOURCE_SNAPSHOT', message: errors[0] }, 400)
        }
      }
      for (const item of [...snapshot.ninjas, ...snapshot.secretScrolls, ...snapshot.summons]) {
        if (seen.has(item.id)) return json({ error: 'INVALID_RESOURCE_SNAPSHOT', message: `资源 ID 全局重复：${item.id}` }, 400)
        seen.add(item.id)
      }
      const sanitizeAuxiliary = (
        items: OnlineResourceSnapshot[],
        resourceType: 'SECRET_SCROLL' | 'SUMMON',
      ): OnlineResourceSnapshot[] => items.map((item) => ({
        resourceType,
        id: item.id,
        name: item.name,
        enabled: item.enabled,
        ...(item.asset ? { asset: item.asset } : {}),
        ...(item.avatar ? { avatar: item.avatar } : {}),
        ...(item.assetKey ? { assetKey: item.assetKey } : {}),
        ...(item.tags?.length ? { tags: [...item.tags] } : {}),
      }))
      resourceSnapshot = {
        ninjas: snapshot.ninjas.map((item) => ({
          id: item.id,
          name: item.name,
          enabled: item.enabled,
          quality: item.quality,
          ...(item.avatar ? { avatar: item.avatar } : {}),
          ...(item.assetKey ? { assetKey: item.assetKey } : {}),
        })),
        secretScrolls: sanitizeAuxiliary(snapshot.secretScrolls, 'SECRET_SCROLL'),
        summons: sanitizeAuxiliary(snapshot.summons, 'SUMMON'),
      }
      ninjas = resourceSnapshot.ninjas
    }

    // 忍者池快照（BP 校验依据）：v0.4 直接保存完整快照（id/enabled 的超集，
    // 显示权威）；旧客户端兼容走 pool（仅 {id,enabled}）
    let pool: { id: string; enabled: boolean }[]
    if (ninjas) {
      pool = ninjas
    } else {
      const rawPool = Array.isArray(body.pool) ? body.pool : []
      if (rawPool.length > 2000) {
        return json({ error: 'POOL_TOO_LARGE', message: '忍者池条目过多（最多 2000）' }, 400)
      }
      const seenIds = new Set<string>()
      pool = []
      for (const item of rawPool) {
        const rec = item as { id?: unknown; enabled?: unknown }
        const id = typeof rec?.id === 'string' ? rec.id : ''
        if (id.length < 1 || id.length > 100 || seenIds.has(id)) continue
        seenIds.add(id)
        pool.push({ id, enabled: rec.enabled !== false })
      }
    }

    // 容量合法性：可用忍者必须足够完成整场比赛（最坏情况），否则拒绝创建
    const required = getMinimumRequiredResources(rule)
    const available = {
      ninjas: countEnabledResources(resourceSnapshot?.ninjas ?? pool),
      secretScrolls: countEnabledResources(resourceSnapshot?.secretScrolls ?? []),
      summons: countEnabledResources(resourceSnapshot?.summons ?? []),
    }
    const insufficient = (['ninjas', 'secretScrolls', 'summons'] as const).find((type) => available[type] < required[type])
    if (insufficient) {
      return json(
        { error: 'INSUFFICIENT_RESOURCE_POOL', message: '资源池可用数量不足以完成整场比赛', resourceType: insufficient, required: required[insufficient], available: available[insufficient] },
        400,
      )
    }

    // 数据包元信息（仅结构化展示与加入一致性提示，不参与 BP 计算）
    let packMetadata: Record<string, string | number> | null = null
    if (body.packMetadata && typeof body.packMetadata === 'object') {
      const rec = body.packMetadata as Record<string, unknown>
      const packId = typeof rec.packId === 'string' ? rec.packId.trim() : ''
      if (packId.length > 0 && packId.length <= 100) {
        packMetadata = { packId }
        if (typeof rec.schemaVersion === 'number' && Number.isInteger(rec.schemaVersion) && rec.schemaVersion >= 0) {
          packMetadata.schemaVersion = rec.schemaVersion
        }
        if (typeof rec.packVersion === 'string' && rec.packVersion.length <= 40) packMetadata.packVersion = rec.packVersion
        if (typeof rec.checksum === 'string' && /^sha256:[0-9a-f]{64}$/i.test(rec.checksum)) packMetadata.checksum = rec.checksum
      }
    }

    // 初始权威状态：SETUP 场次（START_MATCH 命令才会正式开始并填充玩家名）
    const match = createMatch(rule, seat === 'BLUE' ? displayName : '', seat === 'RED' ? displayName : '')

    // 创建限速：60 秒 5 个 / 24 小时 20 个（按 auth user，成败都计数）
    const { error: attemptError } = await admin.from('action_attempts').insert({
      user_id: user.id,
      action_type: 'CREATE_ROOM',
    })
    if (attemptError) return json({ error: 'DB_ERROR', message: attemptError.message }, 500)
    const windowStart = new Date(Date.now() - CREATE_RATE_WINDOW_MS).toISOString()
    const dayStart = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count: recent } = await admin
      .from('action_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action_type', 'CREATE_ROOM')
      .gt('attempted_at', windowStart)
    if ((recent ?? 0) > CREATE_RATE_MAX) {
      return json({ error: 'RATE_LIMITED', message: '创建过于频繁，请稍后再试' }, 429)
    }
    const { count: daily } = await admin
      .from('action_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action_type', 'CREATE_ROOM')
      .gt('attempted_at', dayStart)
    if ((daily ?? 0) > CREATE_DAILY_MAX) {
      return json({ error: 'RATE_LIMITED', message: '今日创建房间数量已达上限' }, 429)
    }

    // 原子创建：房间 + 房主入座 + 数据包元信息（任一失败整体回滚）
    const { data, error: rpcError } = await admin.rpc('create_room_transaction', {
      p_user_id: user.id,
      p_seat: seat,
      p_display_name: displayName,
      p_match_state: match,
      p_pool: pool,
      p_data_pack_metadata: packMetadata,
      p_resource_snapshot: resourceSnapshot,
    })
    if (rpcError || !data || !data[0]) {
      const message = rpcError?.message ?? '创建失败'
      if (message.includes('INVALID_POOL')) return json({ error: 'POOL_TOO_LARGE', message: '忍者池不合法' }, 400)
      if (message.includes('INVALID_RESOURCE_SNAPSHOT')) return json({ error: 'INVALID_RESOURCE_SNAPSHOT', message: '资源快照不合法' }, 400)
      return json({ error: 'DB_ERROR', message }, 500)
    }

    return json({
      roomId: data[0].room_id as string,
      code: data[0].room_code as string,
      seat,
      ...(packMetadata ? { packMetadata } : {}),
    })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
