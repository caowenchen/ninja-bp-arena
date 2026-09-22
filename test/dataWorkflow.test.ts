import { describe, expect, it } from 'vitest'
// @ts-expect-error Node workflow module intentionally stays plain ESM for CLI use.
import { auditStableIds, buildDefaultPack, normalizeResource, parseCsv, validateResources } from '../scripts/lib/data-workflow.mjs'

describe('production data workflow', () => {
  it('normalizes whitespace, Unicode, arrays and booleans deterministically', () => {
    const rows = parseCsv('id,name,quality,tags,aliases,enabled\r\na, Ａ ,S,近战|近战| 控制 ,别名|别名,true\r\n')
    expect(normalizeResource(rows[0], 'NINJA', 0)).toMatchObject({
      id: 'a', name: 'Ａ', tags: ['近战', '控制'], aliases: ['别名'], enabled: true,
    })
  })

  it('detects duplicate IDs across resource types', () => {
    const ninja = normalizeResource({ id: 'same-id', name: 'A', quality: 'S', tags: '', enabled: 'true' }, 'NINJA', 0)
    const scroll = normalizeResource({ id: 'same-id', name: 'B', tags: '', enabled: 'true' }, 'SECRET_SCROLL', 0)
    const result = validateResources({ ninjas: [ninja], secretScrolls: [scroll], summons: [] })
    expect(result.errors.join('\n')).toContain('冲突')
  })

  it('reports duplicate aliases and tags even though normalization deduplicates output', () => {
    const ninja = normalizeResource({ id: 'stable-a', name: 'A', quality: 'S', aliases: 'x|x', tags: '近战|近战', enabled: 'true' }, 'NINJA', 0)
    const result = validateResources({ ninjas: [ninja], secretScrolls: [], summons: [] })
    expect(result.errors.join('\n')).toContain('aliases 重复')
    expect(result.errors.join('\n')).toContain('tags 重复')
  })

  it('blocks removed stable IDs and requires review for suspicious renames', () => {
    const registry = [{ id: 'stable-a', type: 'NINJA', name: '旧名字' }, { id: 'stable-b', type: 'SUMMON', name: '保留项' }]
    const errors = auditStableIds([{ id: 'stable-a', type: 'NINJA', name: '完全不同' }], registry)
    expect(errors.some((error: string) => error.includes('REVIEW REQUIRED'))).toBe(true)
    expect(errors.some((error: string) => error.includes('removed ID'))).toBe(true)
  })

  it('builds the same checksum and payload for identical source input', () => {
    const first = buildDefaultPack()
    const second = buildDefaultPack()
    expect(second.pack).toEqual(first.pack)
    expect(second.pack.manifest.checksum).toBe(first.pack.manifest.checksum)
    expect(first.pack.manifest.ninjaCount).toBe(first.pack.ninjas.length)
  })
})
