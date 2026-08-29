import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'
import { applyRoomCommand, validateMatchState, type OnlineCommandType, type PendingUndo, type RoomStatus } from '../../shared/bp-core/index.ts'

/**
 * POST /functions/v1/room-command
 * 在线 BP 的唯一写入口：客户端发送语义命令，服务端运行 Shared BP Core
 * 生成新状态并以 revision CAS 写回数据库（禁止 Lost Update）。
 *
 * body: { roomId: string, commandId: string, expectedRevision: number,
 *         type: OnlineCommandType, payload?: { ninjaId?: string; side?: string } }
 *
 * 响应：
 * - 200 { status:'APPLIED', match, revision, roomStatus, pendingUndo }
 * - 400 { status:'REJECTED', code, message, revision, match }（业务拒绝）
 * - 409 { error:'REVISION_CONFLICT', match, revision }（客户端状态过期 → resync）
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RoomRow {
  id: string
  code: string
  status: RoomStatus
  match_state: unknown
  revision: number
  pending_action: unknown
  expires_at: string
  pool: { id: string; enabled: boolean }[]
}

async function loadRoom(admin: ReturnType<typeof serviceClient>, roomId: string): Promise<RoomRow | null> {
  const { data, error } = await admin
    .from('rooms')
    .select('id, code, status, match_state, revision, pending_action, expires_at, pool')
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

    // 命令体大小限制：BP 命令都很小，超大 JSON 直接拒绝
    const rawBody = await req.text()
    if (rawBody.length > 8192) return json({ error: 'PAYLOAD_TOO_LARGE', message: '命令体积超出限制' }, 413)
    const body = JSON.parse(rawBody) as {
      roomId?: string
      commandId?: string
      expectedRevision?: number
      type?: OnlineCommandType
      payload?: { ninjaId?: string; side?: string }
    }

    const { roomId, commandId, type } = body
    const expectedRevision = Number(body.expectedRevision)
    if (!roomId || !UUID_RE.test(roomId)) return json({ error: 'INVALID_COMMAND', message: 'roomId 非法' }, 400)
    if (!commandId || !UUID_RE.test(commandId)) return json({ error: 'INVALID_COMMAND', message: 'commandId 非法' }, 400)
    if (typeof type !== 'string') return json({ error: 'INVALID_COMMAND', message: '缺少命令类型' }, 400)

    // ---- 幂等：同一 commandId 只执行一次（网络重试不产生重复动作）----
    const { data: previous } = await admin
      .from('room_commands')
      .select('status, applied_revision, reject_code, payload, command_type')
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
      .select('seat, user_id')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle()

    const seatUserIds: { BLUE: string | null; RED: string | null } = { BLUE: null, RED: null }
    const { data: seated } = await admin
      .from('room_members')
      .select('seat, user_id')
      .eq('room_id', roomId)
      .in('seat', ['BLUE', 'RED'])
    for (const m of seated ?? []) {
      if (m.seat === 'BLUE') seatUserIds.BLUE = m.user_id as string
      if (m.seat === 'RED') seatUserIds.RED = m.user_id as string
    }

    // ---- 忍者池：房间创建时固化的快照，服务端据此校验忍者存在与启用 ----
    const ninjas: { id: string; enabled: boolean }[] = Array.isArray(room.pool) ? room.pool : []

    // ---- 运行 Shared BP Core（与服务端同一套规则）----
    const outcome = applyRoomCommand(
      {
        match: room.match_state as never,
        revision: room.revision,
        roomStatus: room.status,
        expiresAt: new Date(room.expires_at).getTime(),
        mySeat: (member?.seat as 'BLUE' | 'RED' | 'OBSERVER' | undefined) ?? null,
        isHost: room && (member?.user_id ?? user.id) === room.host_user_id && user.id === room.host_user_id,
        myUserId: user.id,
        hostUserId: room.host_user_id as string,
        seatUserIds,
        pendingUndo: (room.pending_action as PendingUndo | null) ?? null,
        ninjas: ninjas as never,
        now: Date.now(),
      },
      {
        commandId,
        roomId,
        expectedRevision,
        type,
        payload: body.payload,
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

    // ---- APPLIED：状态合法性兜底 + revision CAS 写回（禁止 Lost Update）----
    if (!validateMatchState(outcome.match)) {
      return json({ error: 'INTERNAL', message: '生成的比赛状态未通过校验，已中止写入' }, 500)
    }

    const { data: updated, error: updateError } = await admin
      .from('rooms')
      .update({
        match_state: outcome.match,
        revision: outcome.revision,
        status: outcome.roomStatus,
        pending_action: outcome.pendingUndo,
      })
      .eq('id', roomId)
      .eq('revision', room.revision) // CAS：不是预期版本说明有并发更新
      .select('revision')
      .single()

    if (updateError || !updated) {
      const fresh = await loadRoom(admin, roomId)
      return json(
        { error: 'REVISION_CONFLICT', message: '比赛状态已更新，正在同步', match: fresh?.match_state, revision: fresh?.revision ?? 0 },
        409,
      )
    }

    await admin.from('room_commands').insert({
      command_id: commandId,
      room_id: roomId,
      user_id: user.id,
      command_type: type,
      expected_revision: expectedRevision,
      applied_revision: outcome.revision,
      payload: body.payload ?? null,
      status: 'APPLIED',
    })

    // 审计之外的副带：刷新成员在线时间
    await admin
      .from('room_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', user.id)

    return json({
      status: 'APPLIED',
      match: outcome.match,
      revision: outcome.revision,
      roomStatus: outcome.roomStatus,
      pendingUndo: outcome.pendingUndo,
    })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
