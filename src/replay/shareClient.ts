import { supabase } from '@/lib/supabase'
import type { ReplayBundle } from '@bp-core'

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('在线分享尚未配置')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let payload: { message?: string; error?: string } = {}
    if ('context' in error) {
      try { payload = await (error as { context: Response }).context.json() } catch { /* empty */ }
    }
    throw Object.assign(new Error(payload.message ?? error.message), { code: payload.error })
  }
  return data as T
}

export const replayShareApi = {
  publish: (bundle: ReplayBundle, roomId?: string) => call<{ token: string; checksum: string; createdAt: number }>('replay-publish', { bundle, roomId }),
  fetch: (token: string) => call<{ replay: ReplayBundle['replay']; checksum: string; createdAt: number }>('replay-get', { token }),
  revoke: (token: string) => call<{ revoked: true }>('replay-revoke', { token }),
}
