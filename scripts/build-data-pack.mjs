#!/usr/bin/env node
import { buildDefaultPack } from './lib/data-workflow.mjs'

try {
  const result = buildDefaultPack({ write: true })
  console.log(`✓ Source → Pack：${result.pack.ninjas.length} 忍者 / ${result.pack.secretScrolls.length} 秘卷 / ${result.pack.summons.length} 通灵`)
  console.log(`✓ checksum ${result.pack.manifest.checksum}`)
  console.log('✓ 差异报告 data/reports/latest-diff.json')
} catch (error) {
  console.error(`✗ 数据构建失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
