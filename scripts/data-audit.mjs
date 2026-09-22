#!/usr/bin/env node
import { auditDefaultPack } from './lib/data-workflow.mjs'

const result = auditDefaultPack()
for (const warning of result.warnings) console.warn(`⚠ ${warning}`)
if (result.errors.length) {
  console.error(`\n✗ Data Audit 失败（${result.errors.length} 项）：`)
  for (const error of result.errors) console.error(`  - ${error}`)
  process.exit(1)
}
console.log(`✓ Data Audit：${result.counts.ninjas} 忍者 / ${result.counts.secretScrolls} 秘卷 / ${result.counts.summons} 通灵`)
console.log('✓ 稳定 ID、字段、别名、素材键、数量与 checksum 均通过')
