import { handleOptions, json } from '../_shared/http.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { REPLAY_SHARE_MAX_BYTES, validateReplay } from '../_shared/bp-core/index.ts'

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const raw = await req.text()
    if (raw.length > 1024) return json({ error: 'INVALID_REQUEST' }, 400)
    const token = String((JSON.parse(raw) as { token?: unknown }).token ?? '')
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return json({ error: 'NOT_FOUND', message: '分享不存在' }, 404)
    const admin = serviceClient()
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown'
    const requestHash = await sha256(`${forwarded}:replay-fetch`)
    await admin.from('replay_fetch_attempts').insert({ request_hash: requestHash })
    const since = new Date(Date.now() - 60_000).toISOString()
    const { count } = await admin.from('replay_fetch_attempts').select('id', { count: 'exact', head: true }).eq('request_hash', requestHash).gt('attempted_at', since)
    if ((count ?? 0) > 60) return json({ error: 'RATE_LIMITED', message: '访问过于频繁，请稍后再试' }, 429)

    const { data, error } = await admin.from('replay_shares').select('replay_data,replay_checksum,status,created_at,expires_at').eq('share_token', token).maybeSingle()
    if (error) return json({ error: 'DB_ERROR', message: error.message }, 500)
    if (!data) return json({ error: 'NOT_FOUND', message: '分享不存在' }, 404)
    if (data.status === 'REVOKED') return json({ error: 'SHARE_REVOKED', message: '该分享已失效' }, 410)
    if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return json({ error: 'SHARE_REVOKED', message: '该分享已失效' }, 410)
    const valid = validateReplay(data.replay_data, REPLAY_SHARE_MAX_BYTES)
    if (!valid.ok) return json({ error: 'CORRUPT_REPLAY', message: '分享数据损坏' }, 500)
    return json({ replay: data.replay_data, checksum: data.replay_checksum, createdAt: new Date(data.created_at).getTime() })
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'INVALID_JSON' }, 400)
    return json({ error: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }, 500)
  }
})
