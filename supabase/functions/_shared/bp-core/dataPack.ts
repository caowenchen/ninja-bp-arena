import type { DraftResourceBase, Ninja, NinjaQuality, OnlineNinjaSnapshot, SecretScroll, Summon } from './types.ts'
import type { BattleResources } from './resourceRegistry.ts'

/**
 * Ninja Data Pack —— 数据包核心逻辑（Shared BP Core）。
 *
 * 数据包 = manifest（元信息）+ ninjas（角色纯数据）。
 * 约定：
 * - 数据与素材解耦：核心 Data Pack 不依赖任何图片资源即可使用；
 * - id 是永久标识：角色改名 / 翻译调整绝不改变 id，改名只动 name；
 * - 不声称官方数据：包名与描述不得出现「官方」字样（校验不拦截，由内容规范约束）；
 * - 角色下架优先 deprecated = true / enabled = false，而不是从包中删除（历史引用安全）。
 */

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * 数据包清单。schemaVersion 描述 JSON 结构版本；version 描述数据内容版本
 * （如 2026.08.1），两者升级节奏互不相同。
 */
export interface NinjaDataPackManifest {
  schemaVersion: number
  /** 包标识（如 ninja-bp-default）。远程比较优先 packId + checksum，version 仅展示 */
  id: string
  name: string
  /** 数据内容版本（如 2026.08.1），仅展示；比较逻辑见 comparePackVersions */
  version: string
  gameVersion?: string
  updatedAt: string
  /** 数据来源说明（如维护者 / 仓库），仅展示 */
  source?: string
  /** DEMO=示例；COMMUNITY=社区维护；VERIFIED=维护者按所列来源核验，均不代表官方认证。 */
  dataStatus?: 'DEMO' | 'COMMUNITY' | 'VERIFIED'
  sources?: Array<{ id: string; label: string; url?: string; checkedAt?: string }>
  description?: string
  /** 忍者数量（校验必须 === ninjas.length） */
  ninjaCount: number
  /** v2 辅助资源数量；v1 导入时自动补 0。 */
  secretScrollCount?: number
  summonCount?: number
  /** ninjas.json 规范化 JSON 的 SHA-256（见 computeJsonChecksum）；存在则必须验证 */
  checksum?: string
  /** 头像素材基地址；配合 ninja.assetKey 拼出 URL */
  assetBaseUrl?: string
}

/** 当前支持的 manifest 结构版本 */
export const PACK_SCHEMA_VERSION = 2

export type BattleDataPackManifest = NinjaDataPackManifest

/** 已安装的数据包（本地持久化形态） */
export interface InstalledDataPack {
  manifest: NinjaDataPackManifest
  ninjas: Ninja[]
  secretScrolls: SecretScroll[]
  summons: Summon[]
  /** 安装来源：内置 / 远程 URL / 本地文件导入 */
  origin: 'BUILT_IN' | 'URL' | 'FILE'
  /** origin = URL 时的 manifest 地址（检查更新用） */
  remoteUrl?: string
  installedAt: string
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string')
}

const QUALITIES: NinjaQuality[] = ['S', 'A', 'B', 'C']
/** ISO 日期（YYYY-MM-DD）或 ISO 日期时间 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/

function isValidReleaseDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false
  return !value.includes('T') || !Number.isNaN(Date.parse(value))
}

/** 校验 manifest；返回错误列表（空数组 = 合法） */
export function validateDataPackManifest(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['manifest 必须是对象']
  if (value.schemaVersion !== 1 && value.schemaVersion !== PACK_SCHEMA_VERSION) {
    errors.push(`manifest.schemaVersion 必须是 1 或 ${PACK_SCHEMA_VERSION}（当前 ${String(value.schemaVersion)}）`)
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') errors.push('manifest.id 不能为空')
  else if (value.id.length > 100) errors.push('manifest.id 过长（>100）')
  if (typeof value.name !== 'string' || value.name.trim() === '') errors.push('manifest.name 不能为空')
  else if (value.name.length > 60) errors.push('manifest.name 过长（>60）')
  if (typeof value.version !== 'string' || value.version.trim() === '') errors.push('manifest.version 不能为空')
  else if (value.version.length > 40) errors.push('manifest.version 过长（>40）')
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) {
    errors.push('manifest.updatedAt 必须是合法时间')
  }
  if (typeof value.ninjaCount !== 'number' || !Number.isInteger(value.ninjaCount) || value.ninjaCount < 0) {
    errors.push('manifest.ninjaCount 必须是非负整数')
  }
  if (value.schemaVersion === 2) {
    if (typeof value.secretScrollCount !== 'number' || !Number.isInteger(value.secretScrollCount) || value.secretScrollCount < 0) {
      errors.push('manifest.secretScrollCount 必须是非负整数')
    }
    if (typeof value.summonCount !== 'number' || !Number.isInteger(value.summonCount) || value.summonCount < 0) {
      errors.push('manifest.summonCount 必须是非负整数')
    }
  }
  if (value.source !== undefined && (typeof value.source !== 'string' || value.source.length > 200)) {
    errors.push('manifest.source 过长（>200）')
  }
  if (value.dataStatus !== undefined && !['DEMO', 'COMMUNITY', 'VERIFIED'].includes(String(value.dataStatus))) {
    errors.push('manifest.dataStatus 必须是 DEMO/COMMUNITY/VERIFIED')
  }
  if (value.sources !== undefined) {
    if (!Array.isArray(value.sources)) errors.push('manifest.sources 必须是数组')
    else for (const [index, source] of value.sources.entries()) {
      if (!isRecord(source) || typeof source.id !== 'string' || !source.id.trim() || typeof source.label !== 'string' || !source.label.trim()) {
        errors.push(`manifest.sources[${index}] 必须包含 id 与 label`)
      } else if (source.url !== undefined && (typeof source.url !== 'string' || !/^https:\/\//i.test(source.url))) {
        errors.push(`manifest.sources[${index}].url 必须是 https URL`)
      } else if (source.checkedAt !== undefined && (typeof source.checkedAt !== 'string' || Number.isNaN(Date.parse(source.checkedAt)))) {
        errors.push(`manifest.sources[${index}].checkedAt 必须是合法日期`)
      }
    }
  }
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 500)) {
    errors.push('manifest.description 过长（>500）')
  }
  if (value.gameVersion !== undefined && (typeof value.gameVersion !== 'string' || value.gameVersion.length > 40)) {
    errors.push('manifest.gameVersion 过长（>40）')
  }
  if (value.checksum !== undefined && (typeof value.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(value.checksum))) {
    errors.push('manifest.checksum 必须是 "sha256:<64位十六进制>" 格式')
  }
  if (value.assetBaseUrl !== undefined) {
    if (typeof value.assetBaseUrl !== 'string' || value.assetBaseUrl.length > 300) {
      errors.push('manifest.assetBaseUrl 过长（>300）')
    } else if (!/^https:\/\//i.test(value.assetBaseUrl) && !value.assetBaseUrl.startsWith('/')) {
      errors.push('manifest.assetBaseUrl 必须是 https:// 或本地绝对路径')
    }
  }
  return errors
}

/** 单条 Ninja 数据校验（数据包级别：更严格，含长度与格式） */
export function validatePackNinja(value: unknown, index: number): string[] {
  const errors: string[] = []
  const label = `ninjas[${index}]`
  if (!isRecord(value)) return [`${label} 不是对象`]
  const rec = value as Record<string, unknown>

  if (typeof rec.id !== 'string' || rec.id.trim() === '') errors.push(`${label}.id 不能为空`)
  else if (rec.id.length > 100) errors.push(`${label}.id 过长（>100）`)
  if (typeof rec.name !== 'string' || rec.name.trim() === '') errors.push(`${label}.name 不能为空`)
  else if (rec.name.length > 40) errors.push(`${label}.name 过长（>40）`)
  if (typeof rec.quality !== 'string' || !QUALITIES.includes(rec.quality as NinjaQuality)) {
    errors.push(`${label}.quality 必须是 S/A/B/C`)
  }
  if (typeof rec.enabled !== 'boolean') errors.push(`${label}.enabled 必须是 boolean`)
  if (rec.tags !== undefined) {
    if (!isStringArray(rec.tags)) errors.push(`${label}.tags 必须是 string[]`)
    else if (new Set(rec.tags).size !== rec.tags.length) errors.push(`${label}.tags 存在重复`)
  } else {
    errors.push(`${label}.tags 缺失`)
  }
  if (rec.aliases !== undefined && !isStringArray(rec.aliases)) errors.push(`${label}.aliases 必须是 string[]`)
  if (rec.sourceRefs !== undefined && !isStringArray(rec.sourceRefs)) errors.push(`${label}.sourceRefs 必须是 string[]`)
  if (rec.series !== undefined && !isStringArray(rec.series)) errors.push(`${label}.series 必须是 string[]`)
  if (rec.forms !== undefined && !isStringArray(rec.forms)) errors.push(`${label}.forms 必须是 string[]`)
  if (rec.roles !== undefined && !isStringArray(rec.roles)) errors.push(`${label}.roles 必须是 string[]`)
  if (rec.releaseDate !== undefined) {
    if (typeof rec.releaseDate !== 'string' || !isValidReleaseDate(rec.releaseDate)) {
      errors.push(`${label}.releaseDate 必须是 YYYY-MM-DD 格式`)
    }
  }
  if (rec.avatar !== undefined) {
    if (typeof rec.avatar !== 'string') errors.push(`${label}.avatar 必须是 string`)
    else if (rec.avatar.length > 500) errors.push(`${label}.avatar 过长（>500）`)
  }
  if (rec.assetKey !== undefined) {
    if (typeof rec.assetKey !== 'string') errors.push(`${label}.assetKey 必须是 string`)
    else if (rec.assetKey.length > 200) errors.push(`${label}.assetKey 过长（>200）`)
  }
  if (rec.slug !== undefined && (typeof rec.slug !== 'string' || rec.slug.length > 100)) {
    errors.push(`${label}.slug 过长或非法`)
  }
  if (rec.deprecated !== undefined && typeof rec.deprecated !== 'boolean') {
    errors.push(`${label}.deprecated 必须是 boolean`)
  }
  if (rec.dataVersion !== undefined && (typeof rec.dataVersion !== 'string' || rec.dataVersion.length > 40)) {
    errors.push(`${label}.dataVersion 过长（>40）`)
  }
  if (rec.remark !== undefined && (typeof rec.remark !== 'string' || rec.remark.length > 200)) {
    errors.push(`${label}.remark 过长（>200）`)
  }
  return errors
}

export function validatePackResource(value: unknown, index: number, key: 'secretScrolls' | 'summons'): string[] {
  const errors: string[] = []
  const label = `${key}[${index}]`
  if (!isRecord(value)) return [`${label} 不是对象`]
  const rec = value as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.trim() === '') errors.push(`${label}.id 不能为空`)
  else if (rec.id.length > 100) errors.push(`${label}.id 过长（>100）`)
  if (typeof rec.name !== 'string' || rec.name.trim() === '') errors.push(`${label}.name 不能为空`)
  else if (rec.name.length > 40) errors.push(`${label}.name 过长（>40）`)
  if (typeof rec.enabled !== 'boolean') errors.push(`${label}.enabled 必须是 boolean`)
  if (rec.tags !== undefined && !isStringArray(rec.tags)) errors.push(`${label}.tags 必须是 string[]`)
  if (rec.aliases !== undefined && !isStringArray(rec.aliases)) errors.push(`${label}.aliases 必须是 string[]`)
  if (rec.sourceRefs !== undefined && !isStringArray(rec.sourceRefs)) errors.push(`${label}.sourceRefs 必须是 string[]`)
  for (const field of ['asset', 'avatar'] as const) {
    if (rec[field] !== undefined && (typeof rec[field] !== 'string' || rec[field].length > 500)) {
      errors.push(`${label}.${field} 必须是长度不超过 500 的 string`)
    }
  }
  if (rec.assetKey !== undefined && (typeof rec.assetKey !== 'string' || rec.assetKey.length > 200)) {
    errors.push(`${label}.assetKey 必须是长度不超过 200 的 string`)
  }
  if (rec.deprecated !== undefined && typeof rec.deprecated !== 'boolean') errors.push(`${label}.deprecated 必须是 boolean`)
  if (rec.dataVersion !== undefined && (typeof rec.dataVersion !== 'string' || rec.dataVersion.length > 40)) {
    errors.push(`${label}.dataVersion 过长（>40）`)
  }
  return errors
}

/** 完整数据包校验（manifest + ninjas 全量检查）；返回全部错误 */
export function validateDataPack(manifest: unknown, ninjas: unknown): string[] {
  return validateBattleDataPack(manifest, ninjas, [], [])
}

/** 完整 Battle Data Pack v2 校验；v1 缺少辅助数组时按空数组处理。 */
export function validateBattleDataPack(
  manifest: unknown,
  ninjas: unknown,
  secretScrolls: unknown = [],
  summons: unknown = [],
): string[] {
  const errors = validateDataPackManifest(manifest)
  if (!Array.isArray(ninjas)) {
    errors.push('ninjas 必须是数组')
    return errors
  }
  if (!Array.isArray(secretScrolls)) errors.push('secretScrolls 必须是数组')
  if (!Array.isArray(summons)) errors.push('summons 必须是数组')
  if (!Array.isArray(secretScrolls) || !Array.isArray(summons)) return errors
  if ((manifest as NinjaDataPackManifest | null)?.ninjaCount !== ninjas.length) {
    errors.push(`manifest.ninjaCount(${String((manifest as NinjaDataPackManifest | null)?.ninjaCount)}) 与 ninjas.length(${ninjas.length}) 不一致`)
  }
  const seenIds = new Set<string>()
  ninjas.forEach((item, index) => {
    for (const err of validatePackNinja(item, index)) errors.push(err)
    const id = isRecord(item) ? (item as Record<string, unknown>).id : undefined
    if (typeof id === 'string' && id.trim() !== '') {
      if (seenIds.has(id)) errors.push(`ninjas[${index}].id "${id}" 重复`)
      seenIds.add(id)
    }
  })
  const typedManifest = manifest as NinjaDataPackManifest | null
  if (typedManifest?.schemaVersion === 2 && typedManifest.secretScrollCount !== secretScrolls.length) {
    errors.push(`manifest.secretScrollCount(${String(typedManifest.secretScrollCount)}) 与 secretScrolls.length(${secretScrolls.length}) 不一致`)
  }
  if (typedManifest?.schemaVersion === 2 && typedManifest.summonCount !== summons.length) {
    errors.push(`manifest.summonCount(${String(typedManifest.summonCount)}) 与 summons.length(${summons.length}) 不一致`)
  }
  secretScrolls.forEach((item, index) => {
    errors.push(...validatePackResource(item, index, 'secretScrolls'))
    const id = isRecord(item) ? item.id : undefined
    if (typeof id === 'string') {
      if (seenIds.has(id)) errors.push(`secretScrolls[${index}].id "${id}" 全局重复`)
      seenIds.add(id)
    }
  })
  summons.forEach((item, index) => {
    errors.push(...validatePackResource(item, index, 'summons'))
    const id = isRecord(item) ? item.id : undefined
    if (typeof id === 'string') {
      if (seenIds.has(id)) errors.push(`summons[${index}].id "${id}" 全局重复`)
      seenIds.add(id)
    }
  })
  return errors
}

/** v1 Ninja-only Bundle 到 v2 的无损内存迁移。 */
export function migrateDataPackV1ToV2(input: {
  manifest: NinjaDataPackManifest
  ninjas: Ninja[]
  secretScrolls?: SecretScroll[]
  summons?: Summon[]
}): { manifest: NinjaDataPackManifest; ninjas: Ninja[]; secretScrolls: SecretScroll[]; summons: Summon[] } {
  const secretScrolls = input.secretScrolls ?? []
  const summons = input.summons ?? []
  return {
    manifest: {
      ...input.manifest,
      schemaVersion: 2,
      ninjaCount: input.ninjas.length,
      secretScrollCount: secretScrolls.length,
      summonCount: summons.length,
    },
    ninjas: input.ninjas,
    secretScrolls,
    summons,
  }
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface PackDiffFieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface PackDiffUpdatedEntry {
  id: string
  name: string
  changedFields: PackDiffFieldChange[]
}

export interface DataPackDiff {
  added: Ninja[]
  removed: Ninja[]
  updated: PackDiffUpdatedEntry[]
  unchanged: Ninja[]
  resources?: {
    ninjas: ResourceDataPackDiff<Ninja>
    secretScrolls: ResourceDataPackDiff<SecretScroll>
    summons: ResourceDataPackDiff<Summon>
  }
}

export interface ResourceDataPackDiff<T extends DraftResourceBase = DraftResourceBase> {
  added: T[]
  removed: T[]
  updated: PackDiffUpdatedEntry[]
  unchanged: T[]
}

/** 参与逐字段比较的数据字段（展示与内容相关；remark 等不参与） */
const DIFF_FIELDS = [
  'name', 'aliases', 'quality', 'tags', 'enabled', 'sortOrder', 'slug', 'series',
  'forms', 'roles', 'rarityLabel', 'assetKey', 'avatar', 'deprecated', 'releaseDate', 'dataVersion',
] as const

/** 值相等比较（数组逐元素） */
function diffValueEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}

/**
 * 比较两个数据包的 ninjas：
 * added / removed / updated（含逐字段 changedFields）/ unchanged。
 * ID 相同但 name 完全不同的条目仍按 updated 处理（含 name 字段变化），
 * 由调用方在预览 UI 中向用户明确提示，绝不偷偷生成新 ID。
 */
export function compareDataPacks(oldNinjas: Ninja[], newNinjas: Ninja[]): DataPackDiff {
  const oldById = new Map(oldNinjas.map((n) => [n.id, n]))
  const diff: DataPackDiff = { added: [], removed: [], updated: [], unchanged: [] }
  for (const next of newNinjas) {
    const prev = oldById.get(next.id)
    if (!prev) {
      diff.added.push(next)
      continue
    }
    const changes: PackDiffFieldChange[] = []
    for (const field of DIFF_FIELDS) {
      const before = (prev as unknown as Record<string, unknown>)[field]
      const after = (next as unknown as Record<string, unknown>)[field]
      if (!diffValueEqual(before, after)) changes.push({ field, before, after })
    }
    if (changes.length === 0) diff.unchanged.push(next)
    else diff.updated.push({ id: next.id, name: next.name, changedFields: changes })
  }
  for (const prev of oldNinjas) {
    if (!newNinjas.some((n) => n.id === prev.id)) diff.removed.push(prev)
  }
  return diff
}

function compareResourceLists<T extends DraftResourceBase>(oldItems: T[], newItems: T[]): ResourceDataPackDiff<T> {
  const oldById = new Map(oldItems.map((item) => [item.id, item]))
  const diff: ResourceDataPackDiff<T> = { added: [], removed: [], updated: [], unchanged: [] }
  for (const next of newItems) {
    const prev = oldById.get(next.id)
    if (!prev) {
      diff.added.push(next)
      continue
    }
    const changes: PackDiffFieldChange[] = []
    for (const field of ['name', 'aliases', 'asset', 'avatar', 'assetKey', 'tags', 'enabled', 'deprecated', 'dataVersion'] as const) {
      const before = (prev as unknown as Record<string, unknown>)[field]
      const after = (next as unknown as Record<string, unknown>)[field]
      if (!diffValueEqual(before, after)) changes.push({ field, before, after })
    }
    if (changes.length) diff.updated.push({ id: next.id, name: next.name, changedFields: changes })
    else diff.unchanged.push(next)
  }
  for (const prev of oldItems) if (!newItems.some((item) => item.id === prev.id)) diff.removed.push(prev)
  return diff
}

export function compareBattleDataPacks(oldPack: BattleResources, newPack: BattleResources): DataPackDiff {
  const ninjas = compareDataPacks(oldPack.ninjas, newPack.ninjas)
  return {
    ...ninjas,
    resources: {
      ninjas,
      secretScrolls: compareResourceLists(oldPack.secretScrolls, newPack.secretScrolls),
      summons: compareResourceLists(oldPack.summons, newPack.summons),
    },
  }
}

// ---------------------------------------------------------------------------
// 版本比较
// ---------------------------------------------------------------------------

/**
 * 解析内容版本号（如 "2026.08.1" → [2026, 8, 1]）。
 * 支持任意点分段数字；无法解析的段按 0 处理并记录是否可解析。
 */
export function parsePackVersion(version: string): number[] | null {
  const trimmed = version.trim()
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null
  return trimmed.split('.').map((s) => Number.parseInt(s, 10))
}

/**
 * 比较数据内容版本：返回正数（a 更新）/ 0（相等）/ 负数（b 更新）。
 * 任一版本不可按数字解析（如 "beta"）时返回 null——调用方应回退到
 * updatedAt 比较，逻辑必须明确而不是字符串大小比较（"10" > "9" 陷阱）。
 */
export function comparePackVersions(a: string, b: string): number | null {
  const pa = parsePackVersion(a)
  const pb = parsePackVersion(b)
  if (!pa || !pb) return null
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

/**
 * 判断远程 manifest 是否比本地新：
 * 1) version 都可数字解析 → 比较 version；
 * 2) 否则比较 updatedAt（本地缺 updatedAt 视为更旧）。
 * 只有结果「严格更新」才提示用户；旧版本 / 相同版本不提示（支持手动导入旧包，但不主动推荐）。
 */
export function isRemotePackNewer(local: NinjaDataPackManifest, remote: NinjaDataPackManifest): boolean {
  const byVersion = comparePackVersions(local.version, remote.version)
  if (byVersion !== null) return byVersion < 0
  const localTime = Date.parse(local.updatedAt)
  const remoteTime = Date.parse(remote.updatedAt)
  if (Number.isNaN(localTime) || Number.isNaN(remoteTime)) return false
  return remoteTime > localTime
}

// ---------------------------------------------------------------------------
// 在线快照
// ---------------------------------------------------------------------------

/**
 * 从完整 Ninja 列表构建在线房间 / 比赛快照（轻量显示数据）。
 * 只保留 id / name / enabled / quality / avatar / assetKey，
 * 绝不携带 Base64 图片（JSONB 体积保护）。
 */
export function toOnlineNinjaSnapshots(ninjas: Ninja[], assetBaseUrl?: string): OnlineNinjaSnapshot[] {
  return ninjas.map((n) => {
    const key = n.assetKey?.trim()
    const base = assetBaseUrl ? (assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`) : undefined
    const resolvedAsset = !n.avatar && key && base
      ? (/^https:\/\//i.test(key) ? key : `${base}${key}`)
      : undefined
    return {
      id: n.id,
      name: n.name,
      enabled: n.enabled !== false && n.deprecated !== true,
      quality: n.quality,
      ...(n.avatar ? { avatar: n.avatar } : resolvedAsset ? { avatar: resolvedAsset } : {}),
      ...(key ? { assetKey: key } : {}),
    }
  })
}

/** 校验单个在线快照条目（服务端 room-create / 客户端读取共用） */
export function validateOnlineNinjaSnapshot(value: unknown, index: number): string[] {
  const errors: string[] = []
  const label = `snapshot[${index}]`
  if (!isRecord(value)) return [`${label} 不是对象`]
  const rec = value as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.trim() === '') errors.push(`${label}.id 不能为空`)
  else if (rec.id.length > 100) errors.push(`${label}.id 过长（>100）`)
  if (typeof rec.name !== 'string' || rec.name.trim() === '') errors.push(`${label}.name 不能为空`)
  else if (rec.name.length > 40) errors.push(`${label}.name 过长（>40）`)
  if (typeof rec.enabled !== 'boolean') errors.push(`${label}.enabled 必须是 boolean`)
  if (typeof rec.quality !== 'string' || !QUALITIES.includes(rec.quality as NinjaQuality)) {
    errors.push(`${label}.quality 必须是 S/A/B/C`)
  }
  if (rec.avatar !== undefined) {
    if (typeof rec.avatar !== 'string') errors.push(`${label}.avatar 必须是 string`)
    else if (rec.avatar.length > 500) errors.push(`${label}.avatar 过长（>500）`)
    else if (/^data:/i.test(rec.avatar)) errors.push(`${label}.avatar 禁止 data: URL（Base64 图片禁止入库）`)
  }
  if (rec.assetKey !== undefined) {
    if (typeof rec.assetKey !== 'string') errors.push(`${label}.assetKey 必须是 string`)
    else if (rec.assetKey.length > 200) errors.push(`${label}.assetKey 过长（>200）`)
  }
  return errors
}

export function validateOnlineResourceSnapshot(
  value: unknown,
  index: number,
  expectedType: 'SECRET_SCROLL' | 'SUMMON',
): string[] {
  const key = expectedType === 'SECRET_SCROLL' ? 'secretScrolls' : 'summons'
  const errors = validatePackResource(value, index, key)
  if (isRecord(value) && value.resourceType !== expectedType) {
    errors.push(`${key}[${index}].resourceType 必须是 ${expectedType}`)
  }
  if (isRecord(value)) {
    if (Array.isArray(value.tags)) {
      if (value.tags.length > 20) errors.push(`${key}[${index}].tags 数量过多（>20）`)
      if (value.tags.some((tag) => tag.length > 40)) errors.push(`${key}[${index}].tags 单项过长（>40）`)
    }
    for (const field of ['asset', 'avatar'] as const) {
      if (typeof value[field] === 'string' && /^data:/i.test(value[field])) {
        errors.push(`${key}[${index}].${field} 禁止 data: URL（Base64 图片禁止入库）`)
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/** 规范化 JSON 文本：解析后重新序列化（与空白 / 换行符 / 行尾无关） */
export function canonicalJson(text: string): string {
  return JSON.stringify(JSON.parse(text))
}

/**
 * 计算规范化 JSON 的 SHA-256，返回 "sha256:<hex>"。
 * 使用 Web Crypto（Browser / Node 18+ / Deno 通用）。
 * 规范化保证同一份数据无论文件格式如何变化，checksum 保持稳定。
 */
export async function computeJsonChecksum(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(text))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256:${hex}`
}

/** 校验 checksum 是否与内容匹配（manifest 未提供 checksum 时视为通过） */
export async function verifyChecksum(expected: string | undefined, ninjasJsonText: string): Promise<boolean> {
  if (!expected) return true
  return (await computeJsonChecksum(ninjasJsonText)) === expected
}
