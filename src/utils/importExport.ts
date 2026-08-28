import { NINJA_QUALITIES, type Ninja, type NinjaQuality } from '@/types/ninja'

/**
 * 忍者 JSON 导入 / 导出。
 * 导入必须严格校验，错误的 JSON 绝不能让应用崩溃。
 */

export interface NinjaImportReport {
  ok: boolean
  errors: string[]
  ninjas: Ninja[]
  added: number
  updated: number
}

function isQuality(value: unknown): value is NinjaQuality {
  return typeof value === 'string' && (NINJA_QUALITIES as string[]).includes(value)
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
    return { ok: false, errors: [`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`], ninjas: [], added: 0, updated: 0 }
  }

  // 允许直接传数组，也允许 { ninjas: [...] } 的包装格式
  let list: unknown
  if (Array.isArray(data)) {
    list = data
  } else if (typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).ninjas)) {
    list = (data as Record<string, unknown>).ninjas
  } else {
    return { ok: false, errors: ['JSON 顶层必须是数组，或包含 ninjas 数组的对象'], ninjas: [], added: 0, updated: 0 }
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

    let id = typeof rec.id === 'string' && rec.id.trim() !== '' ? rec.id.trim() : genId()
    if (seenIds.has(id)) {
      errors.push(`第 ${no} 项（${rec.name}）：ID "${id}" 在文件内重复`)
      return
    }
    seenIds.add(id)

    const tags = Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === 'string') : []

    ninjas.push({
      id,
      name: rec.name.trim(),
      avatar: typeof rec.avatar === 'string' ? rec.avatar : '',
      quality: rec.quality,
      tags,
      enabled: typeof rec.enabled === 'boolean' ? rec.enabled : true,
      version: typeof rec.version === 'string' ? rec.version : undefined,
      releaseDate: typeof rec.releaseDate === 'string' ? rec.releaseDate : undefined,
      remark: typeof rec.remark === 'string' ? rec.remark : undefined,
    })
    // id 是自动生成的场景下一次循环后可能变化，这里仅保证引用一致
    id = ninjas[ninjas.length - 1].id
  })

  return { ok: errors.length === 0 && ninjas.length > 0, errors, ninjas, added: 0, updated: 0 }
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
