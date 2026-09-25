import { handleOptions, json } from '../_shared/http.ts'
import { getUserFromRequest, serviceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const admin = serviceClient()
    const user = await getUserFromRequest(admin, req)
    if (!user) return json({ error: 'NOT_AUTHENTICATED', message: '撤销分享需要认证' }, 401)
    const token = String(((await req.json()) as { token?: unknown }).token ?? '')
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return json({ error: 'NOT_FOUND', message: '分享不存在' }, 404)
    const { data, error } = await admin.from('replay_shares').update({ status: 'REVOKED', revoked_at: new Date().toISOString() }).eq('share_token', token).eq('created_by', user.id).eq('status', 'ACTIVE').select('id').maybeSingle()
    if (error) return json({ error: 'DB_ERROR', message: error.message }, 500)
    if (!data) return json({ error: 'NOT_OWNER', message: '只有发布者可以撤销该分享' }, 403)
    return json({ revoked: true })
  } catch (error) {
    return json({ error: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }, 500)
  }
})
