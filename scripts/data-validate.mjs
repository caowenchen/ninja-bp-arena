#!/usr/bin/env node
/**
 * 内置数据包校验（CI + 本地通用）。
 *
 * 用法：
 *   node scripts/data-validate.mjs [--fix-checksum]
 *
 * 检查项：
 *   - manifest 结构（schemaVersion / id / name / version / updatedAt / ninjaCount）
 *   - manifest.ninjaCount === ninjas.length
 *   - 忍者条目：id 非空且唯一、name 非空、quality 合法、enabled boolean、
 *     tags 为字符串数组且去重、releaseDate 格式、avatar/assetKey 长度、deprecated boolean
 *   - manifest.checksum 与 ninjas.json 规范化 JSON 的 SHA-256 一致
 *
 * --fix-checksum：重新计算 checksum 写回 manifest（数据整理工作流辅助）。
 * 退出码：0 = 通过；1 = 存在错误。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packDir = join(root, 'data', 'packs', 'default')
const manifestPath = join(packDir, 'manifest.json')
const ninjasPath = join(packDir, 'ninjas.json')
const secretScrollsPath = join(packDir, 'secret-scrolls.json')
const summonsPath = join(packDir, 'summons.json')

const fixChecksum = process.argv.includes('--fix-checksum')
const errors = []

function sha256(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (err) {
  console.error(`✗ manifest.json 解析失败：${err.message}`)
  process.exit(1)
}

let ninjas
try {
  ninjas = JSON.parse(readFileSync(ninjasPath, 'utf8'))
} catch (err) {
  console.error(`✗ ninjas.json 解析失败：${err.message}`)
  process.exit(1)
}
let secretScrolls
let summons
try {
  secretScrolls = JSON.parse(readFileSync(secretScrollsPath, 'utf8'))
  summons = JSON.parse(readFileSync(summonsPath, 'utf8'))
} catch (err) {
  console.error(`✗ 辅助资源 JSON 解析失败：${err.message}`)
  process.exit(1)
}

// ---- manifest 结构 ----
if (manifest.schemaVersion !== 2) errors.push(`manifest.schemaVersion 必须是 2（当前 ${manifest.schemaVersion}）`)
if (typeof manifest.id !== 'string' || !manifest.id.trim()) errors.push('manifest.id 不能为空')
if (typeof manifest.name !== 'string' || !manifest.name.trim()) errors.push('manifest.name 不能为空')
if (typeof manifest.version !== 'string' || !manifest.version.trim()) errors.push('manifest.version 不能为空')
if (typeof manifest.updatedAt !== 'string' || Number.isNaN(Date.parse(manifest.updatedAt))) {
  errors.push('manifest.updatedAt 必须是合法时间')
}

// ---- ninjaCount ----
if (manifest.ninjaCount !== ninjas.length) {
  errors.push(`manifest.ninjaCount(${manifest.ninjaCount}) 与 ninjas.length(${ninjas.length}) 不一致`)
}
if (manifest.secretScrollCount !== secretScrolls.length) errors.push(`manifest.secretScrollCount(${manifest.secretScrollCount}) 与 secretScrolls.length(${secretScrolls.length}) 不一致`)
if (manifest.summonCount !== summons.length) errors.push(`manifest.summonCount(${manifest.summonCount}) 与 summons.length(${summons.length}) 不一致`)

// ---- 忍者条目 ----
const seen = new Set()
const qualities = new Set(['S', 'A', 'B', 'C'])
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isValidReleaseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day &&
    (!value.includes('T') || !Number.isNaN(Date.parse(value)))
}
ninjas.forEach((n, i) => {
  const label = `ninjas[${i}]`
  if (typeof n.id !== 'string' || !n.id.trim()) errors.push(`${label}.id 不能为空`)
  else if (n.id.length > 100) errors.push(`${label}.id 过长`)
  if (seen.has(n.id)) errors.push(`${label}.id "${n.id}" 重复`)
  if (n.id) seen.add(n.id)
  if (typeof n.name !== 'string' || !n.name.trim()) errors.push(`${label}.name 不能为空`)
  if (!qualities.has(n.quality)) errors.push(`${label}.quality 必须是 S/A/B/C`)
  if (typeof n.enabled !== 'boolean') errors.push(`${label}.enabled 必须是 boolean`)
  if (!isStringArray(n.tags)) errors.push(`${label}.tags 必须是 string[]`)
  else if (new Set(n.tags).size !== n.tags.length) errors.push(`${label}.tags 存在重复`)
  for (const field of ['aliases', 'series', 'forms', 'roles']) {
    if (n[field] !== undefined && !isStringArray(n[field])) errors.push(`${label}.${field} 必须是 string[]`)
  }
  if (n.releaseDate !== undefined && (typeof n.releaseDate !== 'string' || !isValidReleaseDate(n.releaseDate))) {
    errors.push(`${label}.releaseDate 必须是合法的 YYYY-MM-DD / ISO 时间`)
  }
  if (n.avatar !== undefined && (typeof n.avatar !== 'string' || n.avatar.length > 500)) errors.push(`${label}.avatar 非法或过长`)
  if (n.assetKey !== undefined && (typeof n.assetKey !== 'string' || n.assetKey.length > 200)) errors.push(`${label}.assetKey 非法或过长`)
  if (n.deprecated !== undefined && typeof n.deprecated !== 'boolean') errors.push(`${label}.deprecated 必须是 boolean`)
})

function validateAux(items, key) {
  items.forEach((item, i) => {
    const label = `${key}[${i}]`
    if (typeof item.id !== 'string' || !item.id.trim()) errors.push(`${label}.id 不能为空`)
    else if (item.id.length > 100) errors.push(`${label}.id 过长`)
    if (seen.has(item.id)) errors.push(`${label}.id "${item.id}" 全局重复`)
    if (item.id) seen.add(item.id)
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 40) errors.push(`${label}.name 非法`)
    if (typeof item.enabled !== 'boolean') errors.push(`${label}.enabled 必须是 boolean`)
    if (!isStringArray(item.tags)) errors.push(`${label}.tags 必须是 string[]`)
    if (item.aliases !== undefined && !isStringArray(item.aliases)) errors.push(`${label}.aliases 必须是 string[]`)
    for (const field of ['asset', 'avatar']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > 500)) errors.push(`${label}.${field} 非法或过长`)
    }
    if (item.assetKey !== undefined && (typeof item.assetKey !== 'string' || item.assetKey.length > 200)) errors.push(`${label}.assetKey 非法或过长`)
  })
}
validateAux(secretScrolls, 'secretScrolls')
validateAux(summons, 'summons')

// ---- checksum ----
const computed = `sha256:${sha256(JSON.stringify({ ninjas, secretScrolls, summons }))}`.trim()
if (fixChecksum) {
  manifest.checksum = computed
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`✓ manifest.checksum 已更新为 ${computed}`)
} else if (manifest.checksum !== computed) {
  errors.push(`manifest.checksum(${manifest.checksum}) 与计算值(${computed}) 不一致`)
}

// ---- 汇总 ----
if (errors.length > 0) {
  console.error(`\n✗ 数据包校验失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`✓ 数据包「${manifest.name}」v${manifest.version}：${ninjas.length} 忍者 / ${secretScrolls.length} 秘卷 / ${summons.length} 通灵，checksum 一致`)
