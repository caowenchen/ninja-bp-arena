import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 客户端（在线 BP 模式）。
 *
 * - 只使用 VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY（前端公开凭据）
 * - 未配置时返回 null：本地 BP 完全不受影响，在线入口显示「在线模式尚未配置」
 * - 绝不引入 SERVICE ROLE / SECRET 等服务端密钥
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isOnlineConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = isOnlineConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        // 匿名会话持久化：刷新页面仍能识别同一参与者
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
