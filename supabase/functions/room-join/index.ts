import { json, handleOptions } from '../_shared/http.ts'
import { serviceClient, getUserFromRequest } from '../_shared/supabase.ts'

/**
 * POST /functions/v1/room-join
 * 通过房间码加入房间（席位的唯一性与容量由数据库唯一索引保证）。
 * body: { code: string, seat: 'AUTO' | 'BLUE' | 'RED' | 'OBSERVER', displayName: string }
 *
 * 说明：再次调用（刷新 / 重连）时若已是成员，直接返回现有席位（幂等）。
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '请先进入在线模式' }, 401)

    const body = await req.json().catch(() => null)
    const code = String(body?.code ?? '').trim().toUpperCase()
    const seat = String(body?.seat ?? 'AUTO')
    const displayName = String(body?.displayName ?? '').trim() || '玩家'

    if (code.length < 4 || code.length > 8) {
      return json({ error: 'INVALID_CODE', message: '房间号格式不正确' }, 400)
    }
    if (displayName.length < 1 || displayName.length > 20) {
      return json({ error: 'INVALID_DISPLAY_NAME', message: '显示名称需要 1~20 个字符' }, 400)
    }
    if (!['AUTO', 'BLUE', 'RED', 'OBSERVER'].includes(seat)) {
      return json({ error: 'INVALID_SEAT', message: '席位参数不正确' }, 400)
    }

    // ---- 基础频率限制（按用户）：60 秒内加入超过 10 次视为滥用 ----
    const { count: recentJoins } = await admin
      .from('room_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('joined_at', new Date(Date.now() - 60_000).toISOString())
    if ((recentJoins ?? 0) >= 10) {
      return json({ error: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' }, 429)
    }

    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('id, code, status, expires_at, host_user_id')
      .eq('code', code)
      .maybeSingle()
    if (roomError) return json({ error: 'DB_ERROR', message: roomError.message }, 500)
    if (!room) return json({ error: 'ROOM_NOT_FOUND', message: '房间不存在，请核对房间号' }, 404)
    if (room.status === 'CLOSED') return json({ error: 'ROOM_CLOSED', message: '房间已关闭' }, 410)
    if (new Date(room.expires_at as string).getTime() < Date.now()) {
      return json({ error: 'ROOM_EXPIRED', message: '房间已过期' }, 410)
    }

    // 已是成员 → 幂等返回当前席位（刷新 / 断线重连不重复占席）
    const { data: existing } = await admin
      .from('room_members')
      .select('seat, display_name')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) {
      await admin
        .from('room_members')
        .update({ last_seen_at: new Date().toISOString(), display_name: displayName })
        .eq('room_id', room.id)
        .eq('user_id', user.id)
      return json({ roomId: room.id, code: room.code, seat: existing.seat, rejoined: true })
    }

    // 解析目标席位：请求优先，冲突或 AUTO 时自动挑空位，都满则观战
    const { data: members } = await admin
      .from('room_members')
      .select('seat')
      .eq('room_id', room.id)
    const taken = new Set((members ?? []).map((m) => m.seat as string))

    let resolved: 'BLUE' | 'RED' | 'OBSERVER'
    if (seat === 'OBSERVER') {
      resolved = 'OBSERVER'
    } else if ((seat === 'BLUE' || seat === 'RED') && !taken.has(seat)) {
      resolved = seat
    } else {
      resolved = !taken.has('BLUE') ? 'BLUE' : !taken.has('RED') ? 'RED' : 'OBSERVER'
    }

    const { error: insertError } = await admin.from('room_members').insert({
      room_id: room.id,
      user_id: user.id,
      seat: resolved,
      display_name: displayName,
    })
    if (insertError) {
      // 唯一索引冲突：另一人抢先入座
      if (insertError.code === '23505') {
        return json({ error: 'SEAT_TAKEN', message: '该阵营刚被占用，请选择其他阵营' }, 409)
      }
      return json({ error: 'DB_ERROR', message: insertError.message }, 500)
    }

    return json({ roomId: room.id, code: room.code, seat: resolved, rejoined: false })
  } catch (err) {
    return json({ error: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
