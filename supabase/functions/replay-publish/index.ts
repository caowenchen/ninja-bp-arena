import { handleOptions, json } from '../_shared/http.ts'
import { getUserFromRequest, serviceClient } from '../_shared/supabase.ts'
import { REPLAY_SHARE_MAX_BYTES, validateReplayBundle, type ReplayBundle } from '../_shared/bp-core/index.ts'

const MAX_BODY_BYTES = REPLAY_SHARE_MAX_BYTES + 4096

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '发布分享需要匿名认证' }, 401)
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'PAYLOAD_TOO_LARGE', message: '复盘超过 512 KB 分享限制' }, 413)
    const body = JSON.parse(raw) as { bundle?: unknown; roomId?: unknown }
    const valid = validateReplayBundle(body.bundle, REPLAY_SHARE_MAX_BYTES)
    if (!valid.ok) return json({ error: 'INVALID_REPLAY', message: valid.errors[0] }, 400)
    const bundle = body.bundle as ReplayBundle
    const roomId = typeof body.roomId === 'string' && /^[0-9a-f-]{36}$/i.test(body.roomId) ? body.roomId : null
    if (bundle.replay.source === 'ONLINE') {
      if (!roomId || bundle.replay.metadata.roomId !== roomId) return json({ error: 'ROOM_REQUIRED', message: '在线复盘缺少房间归属' }, 403)
      const { count } = await admin.from('room_members').select('room_id', { count: 'exact', head: true }).eq('room_id', roomId).eq('user_id', user.id).in('seat', ['BLUE', 'RED'])
      if (!count) return json({ error: 'NOT_ROOM_MEMBER', message: '只有比赛参与者或房主可以发布在线复盘' }, 403)
    }
    await admin.from('action_attempts').insert({ user_id: user.id, action_type: 'PUBLISH_REPLAY' })
    const minute = new Date(Date.now() - 60_000).toISOString()
    const day = new Date(Date.now() - 86_400_000).toISOString()
    const [{ count: recent }, { count: daily }] = await Promise.all([
      admin.from('action_attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('action_type', 'PUBLISH_REPLAY').gt('attempted_at', minute),
      admin.from('action_attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('action_type', 'PUBLISH_REPLAY').gt('attempted_at', day),
    ])
    if ((recent ?? 0) > 10 || (daily ?? 0) > 100) return json({ error: 'RATE_LIMITED', message: '发布过于频繁，请稍后再试' }, 429)

    const random = crypto.getRandomValues(new Uint8Array(24))
    const token = btoa(String.fromCharCode(...random)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const { data, error } = await admin.from('replay_shares').insert({
      share_token: token,
      created_by: user.id,
      replay_data: bundle.replay,
      replay_checksum: bundle.checksum,
      source_match_id: bundle.replay.metadata.matchId,
      room_id: roomId,
    }).select('created_at').single()
    if (error) return json({ error: 'DB_ERROR', message: error.message }, 500)
    return json({ token, checksum: bundle.checksum, createdAt: new Date(data.created_at).getTime() }, 201)
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'INVALID_JSON', message: '请求 JSON 无效' }, 400)
    return json({ error: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }, 500)
  }
})
