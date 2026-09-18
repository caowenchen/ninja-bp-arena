#!/usr/bin/env node
/**
 * CSV → Data Pack 构建脚本（数据整理工作流）。
 *
 * 推荐维护流程：
 *   Excel / 文本编辑器维护 data/source/ninjas.csv
 *   → node scripts/build-data-pack.mjs
 *   → 生成 data/packs/default/ninjas.json + 更新 manifest（ninjaCount/checksum）
 *   → npm run data:validate 校验
 *   → commit
 *
 * CSV 列：id,name,aliases,quality,tags,releaseDate,enabled,assetKey
 * aliases / tags 用 | 分隔（如：秽土斑|白面具）。
 * 没有 CSV 源时不做任何事（项目当前以内置 JSON 为准），退出码 0。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const csvPath = join(root, 'data', 'source', 'ninjas.csv')
const packDir = join(root, 'data', 'packs', 'default')
const manifestPath = join(packDir, 'manifest.json')
const ninjasPath = join(packDir, 'ninjas.json')

if (!existsSync(csvPath)) {
  console.log('未找到 data/source/ninjas.csv —— 当前以内置 JSON 数据为准，无需构建。')
  console.log('如需使用 CSV 工作流，请按模板 templates/ninja-data-pack.example.csv 建立该文件。')
  process.exit(0)
}

function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1 } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) { cells.push(cur); cur = '' } else cur += ch
  }
  cells.push(cur)
  return cells
}

const lines = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
const headers = lines[0].split(',').map((h) => h.trim())
const idx = (name) => headers.indexOf(name)
for (const col of ['id', 'name', 'quality']) {
  if (idx(col) === -1) {
    console.error(`✗ CSV 缺少必需列：${col}`)
    process.exit(1)
  }
}

const qualities = new Set(['S', 'A', 'B', 'C'])
const splitList = (raw) => (raw ?? '').split('|').map((s) => s.trim()).filter(Boolean)
const ninjas = []
const seen = new Set()
const errors = []

lines.slice(1).forEach((line, i) => {
  const cells = parseCsvLine(line)
  const no = i + 2
  const id = (cells[idx('id')] ?? '').trim()
  const name = (cells[idx('name')] ?? '').trim()
  const quality = (cells[idx('quality')] ?? '').trim()
  if (!id || !name || !qualities.has(quality)) {
    errors.push(`第 ${no} 行：id/name/quality 缺失或非法`)
    return
  }
  if (seen.has(id)) {
    errors.push(`第 ${no} 行：ID "${id}" 重复`)
    return
  }
  seen.add(id)
  const enabledRaw = (cells[idx('enabled')] ?? 'true').trim().toLowerCase()
  const ninja = {
    id,
    name,
    quality,
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

if (errors.length > 0) {
  console.error(`✗ CSV 转换失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

writeFileSync(ninjasPath, JSON.stringify(ninjas, null, 2) + '\n')

// 同步 manifest（版本由维护者手工递增，这里只更新 count 与 checksum）
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.ninjaCount = ninjas.length
const canonical = JSON.stringify(JSON.parse(readFileSync(ninjasPath, 'utf8')))
manifest.checksum = `sha256:${createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex')}`
manifest.updatedAt = new Date().toISOString()
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(`✓ 已生成 ${ninjas.length} 名忍者 → data/packs/default/ninjas.json`)
console.log(`✓ manifest 已更新：ninjaCount=${manifest.ninjaCount}，checksum=${manifest.checksum}`)
console.log('  记得在 CHANGELOG.md 记录本次变化，并按需递增 manifest.version。')
