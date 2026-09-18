import { describe, expect, it } from 'vitest'
import {
  compareDataPacks,
  comparePackVersions,
  computeJsonChecksum,
  isRemotePackNewer,
  parsePackVersion,
  toOnlineNinjaSnapshots,
  validateDataPack,
  validateDataPackManifest,
  validatePackNinja,
  type NinjaDataPackManifest,
} from '../supabase/functions/_shared/bp-core/dataPack'
import type { Ninja } from '../supabase/functions/_shared/bp-core/types'

function manifest(overrides: Partial<NinjaDataPackManifest> = {}): NinjaDataPackManifest {
  return {
    schemaVersion: 1,
    id: 'test-pack',
    name: '测试数据包',
    version: '2026.08.1',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ninjaCount: 2,
    ...overrides,
  }
}

function ninja(overrides: Partial<Ninja> = {}): Ninja {
  return { id: 'n1', name: '忍者一', quality: 'A', tags: ['近战'], enabled: true, ...overrides }
}

describe('Data Pack Manifest 校验', () => {
  it('合法 manifest 无错误', () => {
    expect(validateDataPackManifest(manifest())).toEqual([])
  })

  it('schemaVersion 错误 / 字段缺失被拒绝', () => {
    expect(validateDataPackManifest(manifest({ schemaVersion: 2 })).length).toBeGreaterThan(0)
    expect(validateDataPackManifest(manifest({ id: '' })).length).toBeGreaterThan(0)
    expect(validateDataPackManifest(manifest({ ninjaCount: -1 })).length).toBeGreaterThan(0)
    expect(validateDataPackManifest(manifest({ updatedAt: 'not-a-date' })).length).toBeGreaterThan(0)
  })

  it('checksum 必须是 sha256 格式；assetBaseUrl 必须 https 或本地路径', () => {
    expect(validateDataPackManifest(manifest({ checksum: 'md5:abc' })).length).toBeGreaterThan(0)
    expect(validateDataPackManifest(manifest({ checksum: `sha256:${'a'.repeat(64)}` }))).toEqual([])
    expect(validateDataPackManifest(manifest({ assetBaseUrl: 'http://example.com/' })).length).toBeGreaterThan(0)
    expect(validateDataPackManifest(manifest({ assetBaseUrl: 'https://example.com/' }))).toEqual([])
    expect(validateDataPackManifest(manifest({ assetBaseUrl: '/assets/ninjas/' }))).toEqual([])
  })
})

describe('Data Pack 忍者校验', () => {
  it('合法条目无错误', () => {
    expect(validatePackNinja(ninja(), 0)).toEqual([])
  })

  it('缺 name / 非法 quality / tags 重复被拒绝', () => {
    expect(validatePackNinja(ninja({ name: '' }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ quality: 'X' as never }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ tags: ['近战', '近战'] }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ releaseDate: '2026/08/01' }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ releaseDate: '2026-02-31' }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ releaseDate: '2026-08-01-not-iso' }), 0).length).toBeGreaterThan(0)
    expect(validatePackNinja(ninja({ releaseDate: '2026-08-01' }), 0)).toEqual([])
  })

  it('完整包：ID 唯一 + ninjaCount 一致', () => {
    const errors = validateDataPack(manifest(), [ninja(), ninja({ id: 'n2', name: '忍者二' })])
    expect(errors).toEqual([])
    expect(validateDataPack(manifest(), [ninja(), ninja({ id: 'n1', name: '重复' })]).length).toBeGreaterThan(0)
    expect(validateDataPack(manifest({ ninjaCount: 3 }), [ninja(), ninja({ id: 'n2', name: 'x' })]).length).toBeGreaterThan(0)
  })

  it('500 名忍者的数据包可正常校验', () => {
    const ninjas = Array.from({ length: 500 }, (_, i) => ninja({ id: `n-${i}`, name: `忍者${i}` }))
    expect(validateDataPack(manifest({ ninjaCount: ninjas.length }), ninjas)).toEqual([])
  })
})

describe('Data Pack Diff', () => {
  it('added / removed / updated(逐字段) / unchanged', () => {
    const oldPack = [
      ninja({ id: 'a', name: '甲' }),
      ninja({ id: 'b', name: '乙', quality: 'B' }),
      ninja({ id: 'c', name: '丙' }),
    ]
    const newPack = [
      ninja({ id: 'a', name: '甲' }), // unchanged
      ninja({ id: 'b', name: '乙', quality: 'S', aliases: ['新乙'] }), // updated
      ninja({ id: 'd', name: '丁' }), // added
      // c removed
    ]
    const diff = compareDataPacks(oldPack, newPack)
    expect(diff.added.map((n) => n.id)).toEqual(['d'])
    expect(diff.removed.map((n) => n.id)).toEqual(['c'])
    expect(diff.unchanged.map((n) => n.id)).toEqual(['a'])
    expect(diff.updated).toHaveLength(1)
    expect(diff.updated[0].changedFields.map((f) => f.field).sort()).toEqual(['aliases', 'quality'])
  })
})

describe('版本比较', () => {
  it('数字分段比较（不是字符串比较）', () => {
    expect(comparePackVersions('2026.08.1', '2026.08.1')).toBe(0)
    expect(comparePackVersions('2026.09.1', '2026.08.3')).toBeGreaterThan(0)
    expect(comparePackVersions('10', '9')).toBeGreaterThan(0) // "9" < "10" 字符串陷阱
    expect(parsePackVersion('2026.08.1')).toEqual([2026, 8, 1])
  })

  it('不可解析版本返回 null，回退 updatedAt', () => {
    expect(comparePackVersions('beta', '2026.08.1')).toBeNull()
    const local = manifest({ version: 'v1', updatedAt: '2026-08-01T00:00:00.000Z' })
    const newer = manifest({ version: 'v1', updatedAt: '2026-09-01T00:00:00.000Z' })
    expect(isRemotePackNewer(local, newer)).toBe(true)
    expect(isRemotePackNewer(local, manifest({ version: 'v1', updatedAt: '2026-08-01T00:00:00.000Z' }))).toBe(false)
  })

  it('旧版本 / 相同版本不提示更新（downgrade）', () => {
    const local = manifest({ version: '2026.09.1' })
    expect(isRemotePackNewer(local, manifest({ version: '2026.08.1' }))).toBe(false)
    expect(isRemotePackNewer(local, manifest({ version: '2026.09.1' }))).toBe(false)
  })
})

describe('在线忍者快照', () => {
  it('只保留轻量字段，deprecated/停用反映到 enabled', () => {
    const snap = toOnlineNinjaSnapshots([
      ninja({ id: 'a', name: '甲', avatar: 'https://x/y.webp', assetKey: 'a.webp', remark: '多余字段', series: ['疾风传'] }),
      ninja({ id: 'b', name: '乙', enabled: false, deprecated: true }),
    ])
    expect(snap[0]).toEqual({ id: 'a', name: '甲', enabled: true, quality: 'A', avatar: 'https://x/y.webp', assetKey: 'a.webp' })
    expect(snap[1].enabled).toBe(false)
    expect('series' in snap[0]).toBe(false)
  })

  it('assetKey 在快照创建时解析为稳定头像地址', () => {
    const [snap] = toOnlineNinjaSnapshots(
      [ninja({ assetKey: 'n1.webp' })],
      'https://cdn.example.com/ninjas/',
    )
    expect(snap.avatar).toBe('https://cdn.example.com/ninjas/n1.webp')
    expect(snap.assetKey).toBe('n1.webp')
  })
})

describe('Checksum', () => {
  it('规范化 JSON 的 SHA-256 与文件格式（空白/换行）无关', async () => {
    const pretty = JSON.stringify([{ id: 'a' }, { id: 'b' }], null, 2)
    const compact = JSON.stringify([{ id: 'a' }, { id: 'b' }])
    expect(await computeJsonChecksum(pretty)).toBe(await computeJsonChecksum(compact))
    expect(await computeJsonChecksum(pretty)).toMatch(/^sha256:[0-9a-f]{64}$/)
    // 内容变化 → checksum 变化
    expect(await computeJsonChecksum(JSON.stringify([{ id: 'a' }]))).not.toBe(await computeJsonChecksum(pretty))
  })
})
