import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'
import {
  applyRoomCommand,
  validateMatchState,
  type OnlineCommandType,
  type PendingUndo,
  type RoomStatus,
  type Seat,
  type SeatMember,
} from '../_shared/bp-core/index.ts'

/**
 * POST /functions/v1/room-command —— 在线 BP 的唯一写入口。
 *
 * 流程：JWT → 用户 → 幂等检查 → 房间/成员/席位 → Shared BP Core 验证并应用
 *       → private.apply_room_state_cas（revision CAS + 审计，同一事务）。
 *
 * 响应：
 * - 200 { status:'APPLIED', match, revision, roomStatus, pendingUndo }
 * - 400 { status:'REJECTED', code, message, revision, match }
 * - 409 { error:'REVISION_CONFLICT', message, match, revision }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 8 * 1024

interface RoomRow {
  id: string
  code: string
  status: RoomStatus
  match_state: unknown
  revision: number
  pending_action: unknown
  expires_at: string
  pool: { id: string; enabled: boolean }[]
  host_user_id: string
}

async function loadRoom(admin: ReturnType<typeof serviceClient>, roomId: string): Promise<RoomRow | null> {
  const { data, error } = await admin
    .from('rooms')
    .select('id, code, status, match_state, revision, pending_action, expires_at, pool, host_user_id')
    .eq('id', roomId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as RoomRow) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '登录状态失效，请刷新页面' }, 401)

    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_BYTES) return json({ error: 'PAYLOAD_TOO_LARGE', message: '命令体积超出限制' }, 413)
    const body = JSON.parse(rawBody) as {
      roomId?: unknown
      commandId?: unknown
      expectedRevision?: unknown
      type?: unknown
      payload?: { ninjaId?: unknown; side?: unknown }
    }

    const roomId = typeof body.roomId === 'string' ? body.roomId : ''
    const commandId = typeof body.commandId === 'string' ? body.commandId : ''
    const expectedRevision = Number(body.expectedRevision)
    const type = typeof body.type === 'string' ? (body.type as OnlineCommandType) : null
    if (!UUID_RE.test(roomId)) return json({ error: 'INVALID_COMMAND', message: 'roomId 非法' }, 400)
    if (!UUID_RE.test(commandId)) return json({ error: 'INVALID_COMMAND', message: 'commandId 非法' }, 400)
    if (!type) return json({ error: 'INVALID_COMMAND', message: '缺少命令类型' }, 400)

    // ---- 幂等：同一 commandId 只执行一次 ----
    const { data: previous } = await admin
      .from('room_commands')
      .select('status, reject_code')
      .eq('command_id', commandId)
      .maybeSingle()
    if (previous) {
      const room = await loadRoom(admin, roomId)
      if (previous.status === 'APPLIED' && room) {
        return json({
          status: 'APPLIED',
          idempotent: true,
          match: room.match_state,
          revision: room.revision,
          roomStatus: room.status,
          pendingUndo: room.pending_action ?? null,
        })
      }
      return json(
        { status: 'REJECTED', code: previous.reject_code ?? 'INVALID_COMMAND', message: '该命令此前已被拒绝', revision: room?.revision ?? 0 },
        400,
      )
    }

    // ---- 房间与成员 ----
    const room = await loadRoom(admin, roomId)
    if (!room) return json({ error: 'ROOM_NOT_FOUND', message: '房间不存在' }, 404)

    const { data: member } = await admin
      .from('room_members')
      .select('seat')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()

    const seatMembers: { BLUE: SeatMember | null; RED: SeatMember | null } = { BLUE: null, RED: null }
    const { data: seated } = await admin
      .from('room_members')
      .select('user_id, seat, display_name')
      .eq('room_id', roomId)
      .in('seat', ['BLUE', 'RED'])
    for (const m of seated ?? []) {
      if (m.seat === 'BLUE') {
        seatMembers.BLUE = { userId: m.user_id as string, displayName: m.display_name as string }
      } else if (m.seat === 'RED') {
        seatMembers.RED = { userId: m.user_id as string, displayName: m.display_name as string }
      }
    }

    // ---- 运行 Shared BP Core（与浏览器同一套规则；Side 由阶段推导，不信任客户端）----
    const outcome = applyRoomCommand(
      {
        match: room.match_state as never,
        revision: room.revision,
        roomStatus: room.status,
        expiresAt: new Date(room.expires_at).getTime(),
        mySeat: (member?.seat as Seat | undefined) ?? null,
        // 真正身份 = JWT user.id，绝不使用请求体传入的任何身份
        isHost: user.id === room.host_user_id,
        myUserId: user.id,
        hostUserId: room.host_user_id,
        seatMembers,
        pendingUndo: (room.pending_action as PendingUndo | null) ?? null,
        ninjas: Array.isArray(room.pool) ? room.pool : [],
        now: Date.now(),
      },
      {
        commandId,
        roomId,
        expectedRevision,
        type,
        payload: {
          ninjaId: typeof body.payload?.ninjaId === 'string' ? body.payload.ninjaId : undefined,
          // side 由服务端按阶段推导；此处仅透传（handler 不信任它）
          side:
            body.payload?.side === 'BLUE' || body.payload?.side === 'RED'
              ? (body.payload.side as 'BLUE' | 'RED')
              : undefined,
        },
      },
    )

    if (outcome.status === 'REJECTED') {
      await admin.from('room_commands').insert({
        command_id: commandId,
        room_id: roomId,
        user_id: user.id,
        command_type: type,
        expected_revision: expectedRevision,
        payload: body.payload ?? null,
        status: 'REJECTED',
        reject_code: outcome.code,
      })
      return json(
        { status: 'REJECTED', code: outcome.code, message: outcome.message, revision: room.revision, match: room.match_state },
        400,
      )
    }

    // ---- APPLIED：状态合法性兜底 + 事务化（CAS + 审计）写入 ----
    if (!validateMatchState(outcome.match)) {
      return json({ error: 'INTERNAL', message: '生成的比赛状态未通过校验，已中止写入' }, 500)
    }

    const { data: casResult, error: casError } = await admin.rpc('apply_room_state_cas', {
      p_room_id: roomId,
      p_expected_revision: room.revision,
      p_command_id: commandId,
      p_user_id: user.id,
      p_command_type: type,
      p_payload: body.payload ?? null,
      p_next_match_state: outcome.match,
      p_next_status: outcome.roomStatus,
      p_next_pending_action: outcome.pendingUndo,
    })
    if (casError) {
      // REVISION_CONFLICT 由 RPC 抛出并整体回滚
      if (casError.message.includes('REVISION_CONFLICT')) {
        const fresh = await loadRoom(admin, roomId)
        return json(
          { error: 'REVISION_CONFLICT', message: '比赛状态已更新，正在同步', match: fresh?.match_state, revision: fresh?.revision ?? 0 },
          409,
        )
      }
      return json({ error: 'DB_ERROR', message: casError.message }, 500)
    }

    const newRevision = Number(casResult)
    if (newRevision === -1) {
      // 幂等命中（并发重复 commandId）：返回当前权威状态，不产生第二次变化
      const fresh = await loadRoom(admin, roomId)
      return json({
        status: 'APPLIED',
        idempotent: true,
        match: fresh?.match_state,
        revision: fresh?.revision ?? outcome.revision,
        roomStatus: fresh?.status ?? outcome.roomStatus,
        pendingUndo: (fresh?.pending_action as PendingUndo | null) ?? null,
      })
    }

    // 刷新成员在线时间
    await admin
      .from('room_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', user.id)

    return json({
      status: 'APPLIED',
      match: outcome.match,
      revision: newRevision,
      roomStatus: outcome.roomStatus,
      pendingUndo: outcome.pendingUndo,
    })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
