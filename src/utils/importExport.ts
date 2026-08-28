import type { Ninja } from '@/types/ninja'

/**
 * 忍者 JSON 导入 / 导出 + 全量备份。
 * 导入必须严格校验，错误的 JSON 绝不能让应用崩溃。
 */

export interface NinjaImportReport {
  ok: boolean
  errors: string[]
  ninjas: Ninja[]
  added: number
  updated: number
  unchanged: number
}

function isQuality(value: unknown): boolean {
  return typeof value === 'string' && ['S', 'A', 'B', 'C'].includes(value)
}

function genId(): string {
  return `nid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 解析并校验导入的忍者 JSON 文本。永远不会抛异常。 */
export function parseNinjaImport(text: string): NinjaImportReport {
  const errors: string[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { ok: false, errors: [`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`], ninjas: [], added: 0, updated: 0, unchanged: 0 }
  }

  // 允许直接传数组，也允许 { ninjas: [...] } 的包装格式
  let list: unknown
  if (Array.isArray(data)) {
    list = data
  } else if (typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).ninjas)) {
    list = (data as Record<string, unknown>).ninjas
  } else {
    return { ok: false, errors: ['JSON 顶层必须是数组，或包含 ninjas 数组的对象'], ninjas: [], added: 0, updated: 0, unchanged: 0 }
  }

  const rawList = list as unknown[]
  if (rawList.length === 0) errors.push('导入内容为空')

  const ninjas: Ninja[] = []
  const seenIds = new Set<string>()

  rawList.forEach((item, index) => {
    const no = index + 1
    if (typeof item !== 'object' || item === null) {
      errors.push(`第 ${no} 项：不是对象`)
      return
    }
    const rec = item as Record<string, unknown>

    if (typeof rec.name !== 'string' || rec.name.trim() === '') {
      errors.push(`第 ${no} 项：缺少有效的 name（名称）`)
      return
    }
    if (!isQuality(rec.quality)) {
      errors.push(`第 ${no} 项（${rec.name}）：quality 必须是 S / A / B / C`)
      return
    }

    const id = typeof rec.id === 'string' && rec.id.trim() !== '' ? rec.id.trim() : genId()
    if (seenIds.has(id)) {
      errors.push(`第 ${no} 项（${rec.name}）：ID "${id}" 在文件内重复`)
      return
    }
    seenIds.add(id)

    const tags = Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === 'string') : []
    const aliases = Array.isArray(rec.aliases)
      ? rec.aliases.filter((t): t is string => typeof t === 'string')
      : undefined

    ninjas.push({
      id,
      name: rec.name.trim(),
      aliases: aliases && aliases.length > 0 ? aliases : undefined,
      avatar: typeof rec.avatar === 'string' ? rec.avatar : '',
      quality: rec.quality as Ninja['quality'],
      tags,
      enabled: typeof rec.enabled === 'boolean' ? rec.enabled : true,
      sortOrder: typeof rec.sortOrder === 'number' && Number.isInteger(rec.sortOrder) ? rec.sortOrder : undefined,
      version: typeof rec.version === 'string' ? rec.version : undefined,
      releaseDate: typeof rec.releaseDate === 'string' ? rec.releaseDate : undefined,
      remark: typeof rec.remark === 'string' ? rec.remark : undefined,
    })
  })

  return { ok: errors.length === 0 && ninjas.length > 0, errors, ninjas, added: 0, updated: 0, unchanged: 0 }
}

/** 相对现有池统计导入预览：新增 / 更新 / 无变化 */
export function previewImport(existing: Ninja[], incoming: Ninja[]): { added: number; updated: number; unchanged: number } {
  const byId = new Map(existing.map((n) => [n.id, JSON.stringify(n)]))
  let added = 0
  let updated = 0
  let unchanged = 0
  for (const n of incoming) {
    const before = byId.get(n.id)
    if (before === undefined) added += 1
    else if (before === JSON.stringify(n)) unchanged += 1
    else updated += 1
  }
  return { added, updated, unchanged }
}

/** 按 id 合并：已存在的更新，不存在的新增 */
export function mergeNinjas(existing: Ninja[], incoming: Ninja[]): { pool: Ninja[]; added: number; updated: number } {
  const byId = new Map(existing.map((n) => [n.id, n]))
  let added = 0
  let updated = 0
  for (const n of incoming) {
    if (byId.has(n.id)) {
      byId.set(n.id, n)
      updated += 1
    } else {
      byId.set(n.id, n)
      added += 1
    }
  }
  return { pool: [...byId.values()], added, updated }
}

export function exportNinjaPoolJSON(pool: Ninja[]): string {
  return JSON.stringify(pool, null, 2)
}

// ---------------------------------------------------------------------------
// 全量备份（忍者池 + 规则 + 设置 + 比赛数据）
// ---------------------------------------------------------------------------

export interface BackupFile {
  app: 'ninja-bp-arena'
  schemaVersion: number
  exportedAt: string
  ninjas: unknown
  customRule: unknown
  settings: unknown
  currentMatch: unknown
  recentMatches: unknown
}

/** 从 localStorage 原始值组装备份文件（不做校验，恢复时再校验） */
export function buildBackup(raws: {
  ninjas: unknown
  customRule: unknown
  settings: unknown
  currentMatch: unknown
  recentMatches: unknown
}): BackupFile {
  return {
    app: 'ninja-bp-arena',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    ...raws,
  }
}

/** 解析备份文件文本；失败返回 null（错误信息在 errors 中） */
export function parseBackup(text: string): { backup?: BackupFile; errors: string[] } {
  const errors: string[] = []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { errors: [`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`] }
  }
  if (typeof data !== 'object' || data === null) return { errors: ['备份文件格式不正确'] }
  const rec = data as Record<string, unknown>
  if (rec.app !== 'ninja-bp-arena') return { errors: ['不是忍者 BP 的备份文件'] }

  const backup: BackupFile = {
    app: 'ninja-bp-arena',
    schemaVersion: typeof rec.schemaVersion === 'number' ? rec.schemaVersion : 1,
    exportedAt: typeof rec.exportedAt === 'string' ? rec.exportedAt : '',
    ninjas: rec.ninjas,
    customRule: rec.customRule ?? null,
    settings: rec.settings,
    currentMatch: rec.currentMatch ?? null,
    recentMatches: rec.recentMatches ?? [],
  }
  if (!Array.isArray(backup.ninjas)) errors.push('备份中的忍者池不是数组')
  if (!Array.isArray(backup.recentMatches)) errors.push('备份中的比赛记录不是数组')
  if (errors.length) return { errors }
  return { backup, errors: [] }
}
