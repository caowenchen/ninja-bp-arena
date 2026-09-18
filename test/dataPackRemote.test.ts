import { afterEach, describe, expect, it, vi } from 'vitest'
import { REMOTE_TIMEOUT_MS, RemoteFetchError, assertRemoteUrl, fetchRemoteManifest } from '../src/dataPack/remote'
import { parseDataPackBundle, parseNinjasCsv, exportNinjasCsv } from '../src/dataPack/service'
import { compactMatchForHistory, collectReferencedNinjaIds } from '../src/dataPack/matchSnapshot'
import { buildMatchPackSnapshot, parseRoomNinjaSnapshot, poolEqualsBuiltIn } from '../src/dataPack/store'
import { computeJsonChecksum } from '../supabase/functions/_shared/bp-core/dataPack'
import type { MatchState } from '../supabase/functions/_shared/bp-core/types'
import { DEFAULT_RULE } from '../src/data/defaultRules'

/**
 * Remote Pack：全部 mock fetch，绝不依赖公网。
 * 覆盖：合法更新 / 非 https / 404 / 超大响应 / 非法 schema / 超时（abort）。
 */

const validManifest = {
  schemaVersion: 1,
  id: 'remote-pack',
  name: '远程测试包',
  version: '2026.09.1',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ninjaCount: 1,
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Remote URL 安全', () => {
  it('生产模式拒绝 http；localhost http 仅开发模式放行', () => {
    expect(() => assertRemoteUrl('https://example.com/manifest.json', false)).not.toThrow()
    expect(() => assertRemoteUrl('http://example.com/manifest.json', false)).toThrow(RemoteFetchError)
    expect(() => assertRemoteUrl('http://localhost:8000/manifest.json', true)).not.toThrow()
    expect(() => assertRemoteUrl('ftp://example.com/x', true)).toThrow(RemoteFetchError)
    expect(() => assertRemoteUrl('not a url', true)).toThrow(RemoteFetchError)
  })
})

describe('fetchRemoteManifest（mock fetch）', () => {
  it('合法 manifest 正常返回', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(validManifest)))
    const m = await fetchRemoteManifest('https://example.com/pack/manifest.json')
    expect(m.id).toBe('remote-pack')
  })

  it('404 → HTTP_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    await expect(fetchRemoteManifest('https://example.com/missing.json')).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 404 })
  })

  it('非法 JSON → INVALID_JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json{{{', { status: 200 })))
    await expect(fetchRemoteManifest('https://example.com/manifest.json')).rejects.toMatchObject({ code: 'INVALID_JSON' })
  })

  it('schema 非法 → INVALID_SCHEMA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...validManifest, schemaVersion: 99 })))
    await expect(fetchRemoteManifest('https://example.com/manifest.json')).rejects.toMatchObject({ code: 'INVALID_SCHEMA' })
  })

  it('超大响应（content-length 超 100KB）→ TOO_LARGE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-length': String(200 * 1024) },
    })))
    await expect(fetchRemoteManifest('https://example.com/manifest.json')).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('无 content-length 时按 UTF-8 字节数限制响应', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('中'.repeat(40_000), { status: 200 })))
    await expect(fetchRemoteManifest('https://example.com/manifest.json')).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('超时（abort）→ TIMEOUT', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }))
    const assertion = expect(fetchRemoteManifest('https://example.com/manifest.json')).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(REMOTE_TIMEOUT_MS)
    await assertion
  })
})

describe('数据包导入完整性', () => {
  it('manifest 提供 checksum 时，内容不匹配必须拒绝', async () => {
    const result = await parseDataPackBundle(JSON.stringify({
      manifest: { ...validManifest, checksum: `sha256:${'0'.repeat(64)}` },
      ninjas: [{ id: 'n1', name: '忍者一', quality: 'A', tags: [], enabled: true }],
    }))
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('checksum')
  })
})

describe('CSV 通道', () => {
  it('导出→导入 roundtrip（aliases/tags 用 | 分隔）', () => {
    const ninjas = [
      { id: 'madara-001', name: '宇智波斑', aliases: ['秽土斑', '白面具'], quality: 'S' as const, tags: ['近战', '爆发'], enabled: true, releaseDate: '2026-01-15', assetKey: 'madara.webp' },
      { id: 'c1', name: '丙', quality: 'C' as const, tags: [], enabled: false },
    ]
    const csv = exportNinjasCsv(ninjas)
    const parsed = parseNinjasCsv(csv)
    expect(parsed.ok).toBe(true)
    expect(parsed.ninjas[0].aliases).toEqual(['秽土斑', '白面具'])
    expect(parsed.ninjas[0].tags).toEqual(['近战', '爆发'])
    expect(parsed.ninjas[0].assetKey).toBe('madara.webp')
    expect(parsed.ninjas[1].enabled).toBe(false)
  })

  it('缺列 / 重复 ID / 非法品质被拒绝', () => {
    expect(parseNinjasCsv('name,quality\n甲,S').ok).toBe(false)
    const bad = 'id,name,quality,tags,enabled\na,甲,S,,true\na,乙,A,,true\nb,丙,X,,true'
    const parsed = parseNinjasCsv(bad)
    expect(parsed.ok).toBe(false)
    expect(parsed.errors.some((e) => e.includes('重复'))).toBe(true)
    expect(parsed.errors.some((e) => e.includes('S/A/B/C'))).toBe(true)
  })
})

describe('比赛快照与历史压缩', () => {
  function matchWith(usedIds: string[]): MatchState {
    const match: MatchState = {
      id: 'm1',
      rule: JSON.parse(JSON.stringify(DEFAULT_RULE)),
      bluePlayerName: '蓝',
      redPlayerName: '红',
      score: { blue: 2, red: 1 },
      currentGame: 3,
      status: 'MATCH_FINISHED',
      history: usedIds.map((id, i) => ({
        id: `act-${i}`,
        gameNumber: 1,
        side: 'BLUE',
        action: 'BAN',
        ninjaId: id,
        timestamp: Date.now(),
        sequenceIndex: i,
      })),
      games: [{ gameNumber: 1, blue: { bans: [], picks: [] }, red: { bans: [], picks: [] }, started: true }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ninjaSnapshot: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `忍者${id}`, enabled: true, quality: 'A' })),
    }
    return match
  }

  it('压缩后只保留参与忍者（历史 fallback 数据）', () => {
    const match = matchWith(['a', 'c'])
    expect(match.ninjaSnapshot).toHaveLength(5)
    const compacted = compactMatchForHistory(match)
    expect(compacted.ninjaSnapshot!.map((n) => n.id).sort()).toEqual(['a', 'c'])
    // 规则 / 比分 / 历史保留
    expect(compacted.rule.bestOf).toBe(3)
    expect(compacted.history).toHaveLength(2)
    expect(collectReferencedNinjaIds(compacted)).toEqual(new Set(['a', 'c']))
  })

  it('没有快照的旧比赛原样返回', () => {
    const match = matchWith([])
    const old = { ...match, ninjaSnapshot: undefined }
    expect(compactMatchForHistory(old)).toBe(old)
  })

  it('本地比赛快照包含嵌套的数据包元信息', () => {
    const snapshot = buildMatchPackSnapshot()
    expect(snapshot.dataPack).toMatchObject({ packId: 'ninja-bp-default', schemaVersion: 1 })
    expect(snapshot.ninjaSnapshot.length).toBeGreaterThan(0)
    expect('packId' in snapshot).toBe(false)
  })

  it('在线新快照有效；旧 {id,enabled} 房间回退本机显示数据', () => {
    const modern = parseRoomNinjaSnapshot([{ id: 'n1', name: '忍者一', quality: 'A', tags: [], enabled: true }])
    expect(modern.valid).toBe(true)
    expect(modern.ninjas[0].name).toBe('忍者一')
    const legacy = parseRoomNinjaSnapshot([{ id: 'n1', enabled: true }])
    expect(legacy.valid).toBe(false)
  })
})

describe('v0.3 默认池迁移', () => {
  it('忽略 v0.4 新字段识别未修改默认池，但保留用户修改', async () => {
    const { BUILT_IN_NINJAS } = await import('../src/dataPack/loader')
    const legacy = BUILT_IN_NINJAS.map((n) => {
      const { slug: _slug, dataVersion: _dataVersion, series: _series, forms: _forms, roles: _roles, rarityLabel: _rarityLabel, assetKey: _assetKey, deprecated: _deprecated, ...old } = n
      return old
    })
    expect(poolEqualsBuiltIn(legacy)).toBe(true)
    expect(poolEqualsBuiltIn(legacy.map((n, i) => (i === 0 ? { ...n, enabled: false } : n)))).toBe(false)
  })
})

describe('checksum 与 manifest 一致性（内置包）', () => {
  it('内置包 manifest.checksum 可由内容推出', async () => {
    const { BUILT_IN_MANIFEST, BUILT_IN_NINJAS } = await import('../src/dataPack/loader')
    const checksum = await computeJsonChecksum(JSON.stringify(BUILT_IN_NINJAS))
    expect(BUILT_IN_MANIFEST.checksum).toBe(checksum)
    expect(BUILT_IN_MANIFEST.ninjaCount).toBe(BUILT_IN_NINJAS.length)
  })
})
