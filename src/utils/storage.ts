/**
 * localStorage 统一封装。
 *
 * 所有持久化都必须经过这里，禁止组件直接调用 localStorage：
 * - 统一 key 前缀
 * - JSON 解析失败时降级为默认值并记录 warning，绝不让页面白屏
 */

export const STORAGE_PREFIX = 'ninja-bp.'

export const STORAGE_KEYS = {
  ninjaPool: 'ninja_pool',
  battleRules: 'battle_rules',
  bpSettings: 'bp_settings',
  currentMatch: 'current_match',
  recentMatches: 'recent_matches',
} as const

function fullKey(key: string): string {
  return STORAGE_PREFIX + key
}

function getLocalStorage(): Storage | null {
  // 测试环境（Node）下可能没有 localStorage，做一次惰性探测
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage
  } catch {
    /* ignore */
  }
  return null
}

/** 读取并解析 JSON；任何异常都返回 fallback */
export function loadJSON<T>(key: string, fallback: T, validate?: (value: unknown) => boolean): T {
  const ls = getLocalStorage()
  if (!ls) return fallback
  try {
    const raw = ls.getItem(fullKey(key))
    if (raw === null || raw === '') return fallback
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) {
      console.warn(`[storage] "${key}" 数据校验未通过，已回退为默认值`)
      return fallback
    }
    return parsed as T
  } catch (err) {
    console.warn(`[storage] "${key}" 数据损坏，已回退为默认值：`, err)
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  const ls = getLocalStorage()
  if (!ls) return
  try {
    ls.setItem(fullKey(key), JSON.stringify(value))
  } catch (err) {
    console.warn(`[storage] "${key}" 写入失败：`, err)
  }
}

export function removeKey(key: string): void {
  const ls = getLocalStorage()
  if (!ls) return
  try {
    ls.removeItem(fullKey(key))
  } catch {
    /* ignore */
  }
}
