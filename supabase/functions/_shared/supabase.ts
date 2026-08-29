import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Edge Function 服务端客户端（service role）。
 *
 * 安全边界：
 * - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL 只从 Deno.env 读取
 * - 绝不返回给客户端，绝不使用 VITE_ 前缀
 * - RLS 被服务端角色绕过是设计使然：match_state 的唯一写入口
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 环境变量')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 从请求的 Bearer JWT 解析用户（匿名登录同样是合法用户） */
export async function getUserFromRequest(
  admin: SupabaseClient,
  req: Request,
): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}
