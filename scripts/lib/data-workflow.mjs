import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE_DIR = join(ROOT, 'data', 'source')
const PACK_DIR = join(ROOT, 'data', 'packs', 'default')
const REPORT_DIR = join(ROOT, 'data', 'reports')
const TYPES = [
  { key: 'ninjas', file: 'ninjas.csv', out: 'ninjas.json', type: 'NINJA' },
  { key: 'secretScrolls', file: 'secret-scrolls.csv', out: 'secret-scrolls.json', type: 'SECRET_SCROLL' },
  { key: 'summons', file: 'summons.csv', out: 'summons.json', type: 'SUMMON' },
]
const QUALITY = new Set(['S', 'A', 'B', 'C'])
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ASSET_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

const text = (value) => String(value ?? '').trim().normalize('NFC')
const list = (value) => [...new Set(text(value).split('|').map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
const bool = (value, fallback = true) => {
  const normalized = text(value).toLowerCase()
  if (!normalized) return fallback
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  throw new Error(`无法解析 boolean：${value}`)
}

export function parseCsv(source) {
  const rows = []
  let row = []; let cell = ''; let quoted = false
  const input = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1 } else quoted = !quoted
    } else if (ch === ',' && !quoted) { row.push(cell); cell = '' }
    else if (ch === '\n' && !quoted) { row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row)
  if (quoted) throw new Error('CSV 引号未闭合')
  if (!rows.length) throw new Error('CSV 为空')
  const headers = rows[0].map(text)
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((key, column) => [key, values[column] ?? ''])))
}

function optional(target, key, value) {
  if (value !== '' && value !== undefined && (!Array.isArray(value) || value.length)) target[key] = value
}

export function normalizeResource(raw, type, index) {
  const item = { id: text(raw.id), name: text(raw.name), tags: list(raw.tags), enabled: bool(raw.enabled) }
  optional(item, 'aliases', list(raw.aliases))
  if (type === 'NINJA') item.quality = text(raw.quality)
  optional(item, 'slug', text(raw.slug))
  optional(item, 'releaseDate', text(raw.releaseDate))
  optional(item, 'assetKey', text(raw.assetKey))
  optional(item, 'dataVersion', text(raw.dataVersion))
  optional(item, 'remark', text(raw.remark))
  optional(item, 'sourceRefs', list(raw.sourceRefs))
  const sortOrder = text(raw.sortOrder)
  if (sortOrder) item.sortOrder = Number(sortOrder)
  if (bool(raw.deprecated, false)) item.deprecated = true
  item.__row = index + 2
  const rawAliases = text(raw.aliases).split('|').map(text).filter(Boolean)
  const rawTags = text(raw.tags).split('|').map(text).filter(Boolean)
  item.__duplicateAliases = new Set(rawAliases).size !== rawAliases.length
  item.__duplicateTags = new Set(rawTags).size !== rawTags.length
  return item
}

export function validateResources(resourcesByType) {
  const errors = []; const warnings = []; const globalIds = new Map(); const assetKeys = new Map()
  for (const { key, type } of TYPES) {
    for (const item of resourcesByType[key]) {
      const label = `${key} 第 ${item.__row} 行`
      if (!item.id || !ID_RE.test(item.id)) errors.push(`${label}：id 为空或格式非法「${item.id}」`)
      if (!item.name) errors.push(`${label}：name 不能为空`)
      if (globalIds.has(item.id)) errors.push(`${label}：ID「${item.id}」与 ${globalIds.get(item.id)} 冲突`)
      else globalIds.set(item.id, key)
      if (type === 'NINJA' && !QUALITY.has(item.quality)) errors.push(`${label}：quality 必须为 S/A/B/C`)
      if (item.__duplicateAliases) errors.push(`${label}：aliases 重复`)
      if (item.__duplicateTags) errors.push(`${label}：tags 重复`)
      if (item.aliases?.includes(item.name)) errors.push(`${label}：aliases 不应重复 name`)
      if (item.deprecated && item.enabled) errors.push(`${label}：deprecated 资源必须 enabled=false`)
      if (item.sortOrder !== undefined && (!Number.isInteger(item.sortOrder) || item.sortOrder < 0)) errors.push(`${label}：sortOrder 必须是非负整数`)
      if (item.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)) errors.push(`${label}：releaseDate 必须为 YYYY-MM-DD`)
      if (item.assetKey) {
        if (!ASSET_KEY_RE.test(item.assetKey) || item.assetKey.startsWith('/') || item.assetKey.includes('..')) errors.push(`${label}：assetKey 非法`)
        if (assetKeys.has(item.assetKey)) errors.push(`${label}：assetKey「${item.assetKey}」与 ${assetKeys.get(item.assetKey)} 重复`)
        else assetKeys.set(item.assetKey, item.id)
      }
      if (item.sourceRefs?.some((ref) => !/^source-[a-z0-9-]+$/.test(ref))) errors.push(`${label}：sourceRefs 格式非法`)
    }
  }
  return { errors, warnings }
}

function clean(items) {
  return items.map(({ __row, __duplicateAliases, __duplicateTags, ...item }) => item).sort((a, b) =>
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function readSources() {
  const result = {}
  for (const spec of TYPES) {
    const path = join(SOURCE_DIR, spec.file)
    if (!existsSync(path)) throw new Error(`缺少 Source 文件：data/source/${spec.file}`)
    result[spec.key] = parseCsv(readFileSync(path, 'utf8')).map((row, index) => normalizeResource(row, spec.type, index))
  }
  return result
}
function canonicalPayload(pack) { return JSON.stringify({ ninjas: pack.ninjas, secretScrolls: pack.secretScrolls, summons: pack.summons }) }
function checksum(pack) { return `sha256:${createHash('sha256').update(canonicalPayload(pack), 'utf8').digest('hex')}` }
function resourceHash(item) { return `sha256:${createHash('sha256').update(JSON.stringify(item), 'utf8').digest('hex')}` }
function compare(oldItems, nextItems) {
  const oldMap = new Map(oldItems.map((item) => [item.id, item])); const nextMap = new Map(nextItems.map((item) => [item.id, item]))
  const added = []; const updated = []; const disabled = []; const removed = []
  for (const item of nextItems) {
    const previous = oldMap.get(item.id)
    if (!previous) added.push(item.id)
    else if (previous.hash ? previous.hash !== resourceHash(item) : JSON.stringify(previous) !== JSON.stringify(item)) updated.push(item.id)
    if (previous?.enabled && !item.enabled) disabled.push(item.id)
  }
  for (const item of oldItems) if (!nextMap.has(item.id)) removed.push(item.id)
  return { added, updated, disabled, removed }
}

export function buildDefaultPack({ write = false } = {}) {
  const sourceManifest = readJson(join(SOURCE_DIR, 'manifest.json'))
  const raw = readSources(); const validation = validateResources(raw)
  if (!['DEMO', 'COMMUNITY', 'VERIFIED'].includes(sourceManifest.dataStatus)) validation.errors.push('Source manifest.dataStatus 非法')
  if (!Array.isArray(sourceManifest.sources)) validation.errors.push('Source manifest.sources 必须是数组')
  else {
    const sourceIds = new Set()
    for (const source of sourceManifest.sources) {
      if (!source?.id || !source?.label || sourceIds.has(source.id)) validation.errors.push('Source manifest.sources 含空值或重复 ID')
      sourceIds.add(source?.id)
    }
    for (const spec of TYPES) for (const item of raw[spec.key]) for (const ref of item.sourceRefs ?? []) {
      if (!sourceIds.has(ref)) validation.errors.push(`${item.id} 引用了不存在的 sourceRef：${ref}`)
    }
  }
  if (validation.errors.length) throw new Error(validation.errors.join('\n'))
  const pack = { manifest: {}, ninjas: clean(raw.ninjas), secretScrolls: clean(raw.secretScrolls), summons: clean(raw.summons) }
  pack.manifest = {
    schemaVersion: 2, id: sourceManifest.id, name: sourceManifest.name, version: sourceManifest.version,
    gameVersion: sourceManifest.gameVersion, updatedAt: sourceManifest.updatedAt, dataStatus: sourceManifest.dataStatus,
    sources: sourceManifest.sources, description: sourceManifest.description,
    ninjaCount: pack.ninjas.length, secretScrollCount: pack.secretScrolls.length, summonCount: pack.summons.length,
    checksum: checksum(pack), assetBaseUrl: sourceManifest.assetBaseUrl,
  }
  const baseline = readJson(join(SOURCE_DIR, 'release-baseline.json'))
  const report = {
    schemaVersion: 1, fromVersion: baseline.version, toVersion: pack.manifest.version,
    resources: Object.fromEntries(TYPES.map((spec) => [spec.key, compare(baseline.resources[spec.key], pack[spec.key])])),
  }
  if (write) {
    for (const spec of TYPES) writeFileSync(join(PACK_DIR, spec.out), `${JSON.stringify(pack[spec.key], null, 2)}\n`)
    writeFileSync(join(PACK_DIR, 'manifest.json'), `${JSON.stringify(pack.manifest, null, 2)}\n`)
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(join(REPORT_DIR, 'latest-diff.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
  return { pack, report, warnings: validation.warnings }
}

export function auditDefaultPack() {
  const errors = []; const warnings = []; let built
  try { built = buildDefaultPack() } catch (error) { return { errors: [error.message], warnings, counts: {} } }
  const registry = readJson(join(SOURCE_DIR, 'stable-ids.json'))
  const current = new Map()
  for (const spec of TYPES) for (const item of built.pack[spec.key]) current.set(item.id, { name: item.name, type: spec.type })
  errors.push(...auditStableIds([...current].map(([id, item]) => ({ id, ...item })), registry.resources))
  const diskManifest = readJson(join(PACK_DIR, 'manifest.json'))
  for (const field of ['ninjaCount', 'secretScrollCount', 'summonCount', 'checksum']) {
    if (diskManifest[field] !== built.pack.manifest[field]) errors.push(`stale manifest.${field}：请运行 npm run data:build`)
  }
  for (const spec of TYPES) {
    const disk = readJson(join(PACK_DIR, spec.out))
    if (JSON.stringify(disk) !== JSON.stringify(built.pack[spec.key])) errors.push(`生成文件 data/packs/default/${spec.out} 已过期`)
  }
  return { errors, warnings, counts: { ninjas: built.pack.ninjas.length, secretScrolls: built.pack.secretScrolls.length, summons: built.pack.summons.length } }
}

export function auditStableIds(currentResources, registryResources) {
  const errors = []
  const current = new Map(currentResources.map((item) => [item.id, item]))
  const registered = new Map(registryResources.map((item) => [item.id, item]))
  for (const [id, item] of current) {
    const stable = registered.get(id)
    if (!stable) errors.push(`missing stable ID：${id}`)
    else if (stable.type !== item.type) errors.push(`stable ID 类型变化：${id} ${stable.type} → ${item.type}`)
    else if (stable.name !== item.name && !(stable.allowedNames ?? []).includes(item.name)) errors.push(`REVIEW REQUIRED：${id} 疑似改名「${stable.name}」→「${item.name}」`)
  }
  for (const [id, item] of registered) if (!current.has(id)) errors.push(`removed ID：${id}（${item.name}）；请保留并设 enabled=false/deprecated=true`)
  return errors
}
