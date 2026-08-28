/**
 * localStorage 统一封装（v2：带 schema 版本与迁移）。
 *
 * 所有持久化都必须经过这里，禁止组件直接调用 localStorage：
 * - 统一 key 前缀
 * - 写入时包装 { __v, data }，读取时校验版本并迁移
 * - JSON 解析失败 / 版本过新 / 校验失败：console.warn 并安全回退，绝不让页面白屏
 */

export const STORAGE_PREFIX = 'ninja-bp.'

/** 当前存储 schema 版本。修改数据结构时递增并补充 migrator。 */
export const STORAGE_SCHEMA_VERSION = 2

export const STORAGE_KEYS = {
  ninjaPool: 'ninja_pool',
  battleRules: 'battle_rules',
  bpSettings: 'bp_settings',
  currentMatch: 'current_match',
  recentMatches: 'recent_matches',
  bpTimer: 'bp_timer',
} as const

interface Wrapped<T> {
  __v: number
  data: T
}

function isWrapped<T>(value: unknown): value is Wrapped<T> {
  return typeof value === 'object' && value !== null && '__v' in value && 'data' in value
}

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

export type Migrator = (legacyData: unknown, fromVersion: number) => unknown

/**
 * 读取并解析 JSON：
 * - v_current 数据直接校验后返回
 * - 更旧版本（含无版本的 v1 遗留数据）先经过 migrate 再校验
 * - 更新版本的数据（用户降级访问）放弃并回退
 * - 校验失败：warn + fallback，绝不让坏数据进入业务状态
 */
export function loadJSON<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => boolean,
  migrate?: Migrator,
): T {
  const ls = getLocalStorage()
  if (!ls) return fallback
  try {
    const raw = ls.getItem(fullKey(key))
    if (raw === null || raw === '') return fallback

    const parsed: unknown = JSON.parse(raw)
    let data: unknown
    if (isWrapped<unknown>(parsed)) {
      if (parsed.__v > STORAGE_SCHEMA_VERSION) {
        console.warn(`[storage] "${key}" 来自更新的版本 (v${parsed.__v})，已忽略`)
        return fallback
      }
      if (parsed.__v < STORAGE_SCHEMA_VERSION) {
        data = migrate ? migrate(parsed.data, parsed.__v) : parsed.data
      } else {
        data = parsed.data
      }
    } else {
      // 无版本包装：视为 v1 遗留数据
      data = migrate ? migrate(parsed, 1) : parsed
    }

    if (validate && !validate(data)) {
      console.warn(`[storage] "${key}" 数据校验未通过，已回退为默认值`)
      return fallback
    }
    return data as T
  } catch (err) {
    console.warn(`[storage] "${key}" 数据损坏，已回退为默认值：`, err)
    return fallback
  }
}

/** 写入：统一包装版本号 */
export function saveJSON(key: string, value: unknown): void {
  const ls = getLocalStorage()
  if (!ls) return
  try {
    const wrapped: Wrapped<unknown> = { __v: STORAGE_SCHEMA_VERSION, data: value }
    ls.setItem(fullKey(key), JSON.stringify(wrapped))
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

/** 读取原始（未包装）文本 —— 备份 / 调试用途 */
export function readRaw(key: string): string | null {
  const ls = getLocalStorage()
  if (!ls) return null
  try {
    return ls.getItem(fullKey(key))
  } catch {
    return null
  }
}
