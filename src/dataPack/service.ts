import type { DataPackDiff, InstalledDataPack, Ninja, NinjaDataPackManifest } from '@bp-core'
import {
  compareDataPacks,
  computeJsonChecksum,
  validateDataPack,
} from '@bp-core'
import type { DataPackBundle } from './types'
import { DATA_PACK_CSV_HEADERS } from './types'

/**
 * DataPackService —— 数据包的解析 / 导入 / 导出 / Diff 纯函数层。
 * UI 不直接 fetch JSON、不自己解析数据，一切通过本模块（Store 再包一层状态）。
 */

export interface ParseBundleResult {
  ok: boolean
  errors: string[]
  manifest?: NinjaDataPackManifest
  ninjas?: Ninja[]
  /** ninjas.json 的规范化 checksum（导入 / 导出时写入 manifest） */
  checksum?: string
}

/**
 * 解析数据包 Bundle 文本：{"manifest": {...}, "ninjas": [...]}。
 * 完整校验（manifest + 每条忍者 + ID 唯一 + ninjaCount 一致）后，
 * 计算并回填 manifest.checksum。永远不会抛异常。
 */
export async function parseDataPackBundle(text: string): Promise<ParseBundleResult> {
  const fail = (errors: string[]): ParseBundleResult => ({ ok: false, errors })
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return fail([`JSON 解析失败：${err instanceof Error ? err.message : String(err)}`])
  }
  if (typeof data !== 'object' || data === null) return fail(['数据包顶层必须是 { manifest, ninjas } 对象'])
  const rec = data as Record<string, unknown>
  if (rec.manifest === undefined || rec.ninjas === undefined) {
    return fail(['数据包必须同时包含 manifest 与 ninjas 字段'])
  }

  const allErrors = validateDataPack(rec.manifest, rec.ninjas)
  if (allErrors.length > 0) return fail(allErrors)

  const manifest = rec.manifest as NinjaDataPackManifest
  const ninjas = rec.ninjas as Ninja[]
  const checksum = await computeJsonChecksum(JSON.stringify(ninjas))
  if (manifest.checksum && manifest.checksum !== checksum) {
    return fail(['manifest.checksum 与 ninjas 内容不匹配'])
  }

  return {
    ok: true,
    errors: [],
    manifest: { ...manifest, checksum },
    ninjas,
    checksum,
  }
}

/** 校验通过后的 bundle → 安装记录 */
export function bundleToInstalledPack(
  parsed: { manifest: NinjaDataPackManifest; ninjas: Ninja[] },
  origin: InstalledDataPack['origin'],
  remoteUrl?: string,
): InstalledDataPack {
  return {
    manifest: { ...parsed.manifest },
    ninjas: parsed.ninjas.map((n) => ({ ...n })),
    origin,
    ...(remoteUrl ? { remoteUrl } : {}),
    installedAt: new Date().toISOString(),
  }
}

/** 导出数据包 Bundle 文本（manifest.checksum 保证与导出内容一致） */
export async function exportDataPackBundle(pack: { manifest: NinjaDataPackManifest; ninjas: Ninja[] }): Promise<string> {
  const checksum = await computeJsonChecksum(JSON.stringify(pack.ninjas))
  const bundle: DataPackBundle = {
    manifest: { ...pack.manifest, checksum, ninjaCount: pack.ninjas.length },
    ninjas: pack.ninjas,
  }
  return JSON.stringify(bundle, null, 2)
}

// ---------------------------------------------------------------------------
// Diff 快捷入口
// ---------------------------------------------------------------------------

export function diffPacks(oldPack: { ninjas: Ninja[] }, newPack: { ninjas: Ninja[] }): DataPackDiff {
  return compareDataPacks(oldPack.ninjas, newPack.ninjas)
}

/** Diff 统计摘要（预览 UI 头部一行式） */
export function summarizeDiff(diff: DataPackDiff): { added: number; updated: number; removed: number; disabled: number } {
  return {
    added: diff.added.length,
    updated: diff.updated.length,
    removed: diff.removed.length,
    disabled: diff.updated.filter((u) => u.changedFields.some((f) => f.field === 'enabled' && f.after === false)).length,
  }
}

// ---------------------------------------------------------------------------
// 数据健康（真实计数，不做虚假评分）
// ---------------------------------------------------------------------------

export interface DataHealth {
  total: number
  duplicateIds: string[]
  missingName: number
  noImage: number
  deprecated: number
  disabled: number
  /** 基本可用（无重复 ID、无缺名） */
  ok: boolean
}

/** 数据健康检查：全部为真实统计，直接展示数字 */
export function computeDataHealth(ninjas: Ninja[]): DataHealth {
  const seen = new Map<string, number>()
  let missingName = 0
  let noImage = 0
  let deprecated = 0
  let disabled = 0
  for (const n of ninjas) {
    seen.set(n.id, (seen.get(n.id) ?? 0) + 1)
    if (!n.name || n.name.trim() === '') missingName += 1
    if (!n.avatar && !n.assetKey) noImage += 1
    if (n.deprecated === true) deprecated += 1
    if (n.enabled === false) disabled += 1
  }
  const duplicateIds = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  return {
    total: ninjas.length,
    duplicateIds,
    missingName,
    noImage,
    deprecated,
    disabled,
    ok: duplicateIds.length === 0 && missingName === 0,
  }
}

// ---------------------------------------------------------------------------
// CSV（可选通道：便于 Excel 整理后重新导入）
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** 导出忍者池为 CSV（列：id,name,aliases,quality,tags,releaseDate,enabled,assetKey） */
export function exportNinjasCsv(ninjas: Ninja[]): string {
  const rows = [DATA_PACK_CSV_HEADERS.join(',')]
  for (const n of ninjas) {
    rows.push(
      [
        csvEscape(n.id),
        csvEscape(n.name),
        csvEscape((n.aliases ?? []).join('|')),
        n.quality,
        csvEscape((n.tags ?? []).join('|')),
        n.releaseDate ?? '',
        n.enabled === false ? 'false' : 'true',
        n.assetKey ?? '',
      ].join(','),
    )
  }
  return rows.join('\n')
}

/** 解析 CSV 文本（第一行为表头；aliases / tags 用 | 分隔）。返回错误列表 + 忍者数组。 */
export function parseNinjasCsv(text: string): { ok: boolean; errors: string[]; ninjas: Ninja[] } {
  const errors: string[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return { ok: false, errors: ['CSV 至少需要表头与一行数据'], ninjas: [] }
  const headers = lines[0].split(',').map((h) => h.trim())
  const idx = (name: string) => headers.indexOf(name)
  const required = ['id', 'name', 'quality']
  for (const col of required) {
    if (idx(col) === -1) errors.push(`CSV 缺少必需列：${col}`)
  }
  if (errors.length > 0) return { ok: false, errors, ninjas: [] }

  const ninjas: Ninja[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, i) => {
    // 简易 CSV 解析（支持引号转义；字段内不含跨行文本）
    const cells: string[] = []
    let cur = ''
    let inQuotes = false
    for (let c = 0; c < line.length; c += 1) {
      const ch = line[c]
      if (ch === '"') {
        if (inQuotes && line[c + 1] === '"') {
          cur += '"'
          c += 1
        } else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur)
        cur = ''
      } else cur += ch
    }
    cells.push(cur)

    const no = i + 2
    const id = (cells[idx('id')] ?? '').trim()
    const name = (cells[idx('name')] ?? '').trim()
    const quality = (cells[idx('quality')] ?? '').trim()
    if (!id) {
      errors.push(`第 ${no} 行：id 不能为空`)
      return
    }
    if (seen.has(id)) {
      errors.push(`第 ${no} 行：ID "${id}" 重复`)
      return
    }
    if (!name) {
      errors.push(`第 ${no} 行：name 不能为空`)
      return
    }
    if (!['S', 'A', 'B', 'C'].includes(quality)) {
      errors.push(`第 ${no} 行（${name}）：quality 必须是 S/A/B/C`)
      return
    }
    seen.add(id)
    const splitList = (raw: string | undefined) =>
      (raw ?? '').split('|').map((s) => s.trim()).filter(Boolean)
    const enabledRaw = (cells[idx('enabled')] ?? 'true').trim().toLowerCase()
    const ninja: Ninja = {
      id,
      name,
      quality: quality as Ninja['quality'],
      tags: splitList(cells[idx('tags')]),
      enabled: enabledRaw !== 'false' && enabledRaw !== '0',
    }
    const aliases = splitList(cells[idx('aliases')])
    if (aliases.length > 0) ninja.aliases = aliases
    const releaseDate = (cells[idx('releaseDate')] ?? '').trim()
    if (releaseDate) ninja.releaseDate = releaseDate
    const assetKey = (cells[idx('assetKey')] ?? '').trim()
    if (assetKey) ninja.assetKey = assetKey
    ninjas.push(ninja)
  })

  return { ok: errors.length === 0 && ninjas.length > 0, errors, ninjas }
}
