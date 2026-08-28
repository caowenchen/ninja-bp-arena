import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RULE, cloneRule } from '../src/data/defaultRules'
import { NINJA_POOL } from '../src/data/ninjas'
import {
  validateMatchState,
  validateNinjaRecord,
  validateStoredRule,
  validateTimerState,
} from '../src/engine/matchValidator'
import { STORAGE_PREFIX, loadJSON, saveJSON, STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from '../src/utils/storage'
import { startMatch, createMatch, selectNinja } from '../src/engine/bpEngine'

// localStorage 内存桩
const memStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => void memStore.clear(),
})

beforeEach(() => memStore.clear())

/** 构造一场合法、有内容的比赛（Game1 完成 bans + 1 pick） */
function buildValidMatch(): Record<string, unknown> {
  let m = startMatch(createMatch(cloneRule(DEFAULT_RULE), '蓝方', '红方'))
  const pick = (id: string) => {
    const r = selectNinja(m, id, NINJA_POOL.find((n) => n.id === id))
    if (!r.state) throw new Error('构造数据失败')
    m = r.state
  }
  pick('example-naruto-001')
  pick('example-sasuke-002')
  pick('example-kakashi-003')
  pick('example-itachi-004')
  pick('example-jiraiya-009')
  return m as unknown as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// validateMatchState：非法数据必须全部拒绝
// ---------------------------------------------------------------------------
describe('MatchState 运行时校验', () => {
  it('合法比赛通过校验', () => {
    expect(validateMatchState(buildValidMatch())).toBe(true)
  })

  it('空 games / games 缺失被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, games: [] })).toBe(false)
    const noGames = { ...m }
    delete noGames.games
    expect(validateMatchState(noGames)).toBe(false)
  })

  it('currentGame 与最后一局不对应被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, currentGame: 2 })).toBe(false)
    expect(validateMatchState({ ...m, currentGame: 0 })).toBe(false)
  })

  it('非法 score 被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, score: { blue: -1, red: 0 } })).toBe(false)
    expect(validateMatchState({ ...m, score: { blue: 1.5, red: 0 } })).toBe(false)
    expect(validateMatchState({ ...m, score: { blue: '1', red: 0 } })).toBe(false)
  })

  it('非法 winner / started 被拒绝', () => {
    const m = buildValidMatch()
    const games = (m.games as unknown[]).map((g) => ({ ...(g as Record<string, unknown>), winner: 'GREEN' }))
    expect(validateMatchState({ ...m, games })).toBe(false)
    const games2 = (m.games as unknown[]).map((g) => ({ ...(g as Record<string, unknown>), started: 'yes' }))
    expect(validateMatchState({ ...m, games: games2 })).toBe(false)
  })

  it('非法 status / id / 时间戳被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, status: 'PLAYING' })).toBe(false)
    expect(validateMatchState({ ...m, id: '' })).toBe(false)
    expect(validateMatchState({ ...m, createdAt: 'yesterday' })).toBe(false)
  })

  it('games 内 bans/picks 不是 string[] 被拒绝', () => {
    const m = buildValidMatch()
    const games = (m.games as unknown[]).map((g) => {
      const bad = structuredClone(g) as Record<string, unknown>
      ;(bad.blue as Record<string, unknown>).picks = [1, 2, 3]
      return bad
    })
    expect(validateMatchState({ ...m, games })).toBe(false)
  })

  it('history 不是数组 / 条目非法被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, history: 'nope' })).toBe(false)
    expect(validateMatchState({ ...m, history: [{ nonsense: true }] })).toBe(false)
  })

  it('非法 rule 被拒绝', () => {
    const m = buildValidMatch()
    expect(validateMatchState({ ...m, rule: {} })).toBe(false)
    const badRule = cloneRule(DEFAULT_RULE) as unknown as Record<string, unknown>
    badRule.pickSequence = 'not-an-array'
    expect(validateMatchState({ ...m, rule: badRule })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 忍者 / 规则 / 计时器 记录校验
// ---------------------------------------------------------------------------
describe('Ninja / Rule / Timer 记录校验', () => {
  it('合法忍者通过，坏品质 / 坏 tags / 空 name 被拒绝', () => {
    const ninja = NINJA_POOL[0] as unknown as Record<string, unknown>
    expect(validateNinjaRecord(ninja)).toBe(true)
    expect(validateNinjaRecord({ ...ninja, quality: 'SS' })).toBe(false)
    expect(validateNinjaRecord({ ...ninja, tags: '近战' })).toBe(false)
    expect(validateNinjaRecord({ ...ninja, name: '  ' })).toBe(false)
    expect(validateNinjaRecord({ ...ninja, aliases: [1, 2] })).toBe(false)
  })

  it('规则模板校验', () => {
    expect(validateStoredRule(DEFAULT_RULE)).toBe(true)
    expect(validateStoredRule({ ...DEFAULT_RULE, name: '' })).toBe(false)
    expect(validateStoredRule(null)).toBe(false)
  })

  it('计时器状态校验', () => {
    expect(validateTimerState({ phaseKey: 'm:G1:S0', deadlineAt: Date.now() })).toBe(true)
    expect(validateTimerState({ phaseKey: null, deadlineAt: null })).toBe(true)
    expect(validateTimerState({ phaseKey: 123, deadlineAt: null })).toBe(false)
    expect(validateTimerState({ phaseKey: 'x', deadlineAt: 'now' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Storage schema v2：加载层必须把坏数据挡在业务之外
// ---------------------------------------------------------------------------
describe('Storage schema 与损坏数据回退', () => {
  it('写入自动带版本包装，读取返回原始数据', () => {
    saveJSON(STORAGE_KEYS.currentMatch, { hello: 'world' })
    const raw = JSON.parse(memStore.get(STORAGE_PREFIX + STORAGE_KEYS.currentMatch)!)
    expect(raw.__v).toBe(STORAGE_SCHEMA_VERSION)
    expect(loadJSON<{ hello: string } | null>(STORAGE_KEYS.currentMatch, null, (v) => !!v && typeof v === 'object' && 'hello' in v)).toEqual({ hello: 'world' })
  })

  it('无版本的 v1 遗留比赛数据可直接读取（迁移为当前版本）', () => {
    // 模拟 v0.1.0 的数据：没有 __v 包装
    const legacy = { legacy: true, games: [1] }
    memStore.set(STORAGE_PREFIX + STORAGE_KEYS.currentMatch, JSON.stringify(legacy))
    const loaded = loadJSON<typeof legacy | null>(STORAGE_KEYS.currentMatch, null, (v) => !!v && 'legacy' in (v as object))
    expect(loaded).toEqual(legacy)
  })

  it('未来版本的数据被安全忽略', () => {
    memStore.set(
      STORAGE_PREFIX + STORAGE_KEYS.currentMatch,
      JSON.stringify({ __v: STORAGE_SCHEMA_VERSION + 5, data: { evil: true } }),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loaded = loadJSON<null>(STORAGE_KEYS.currentMatch, null)
    expect(loaded).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('损坏的 current_match（空 games + 空 rule）不能通过校验进入 store', () => {
    memStore.set(STORAGE_PREFIX + STORAGE_KEYS.currentMatch, JSON.stringify({ games: [], rule: {} }))
    const loaded = loadJSON<unknown>(STORAGE_KEYS.currentMatch, null, (v) => validateMatchState(v))
    expect(loaded).toBeNull()
  })

  it('recentMatches 混入非法对象时可被逐条过滤', () => {
    const good = buildValidMatch()
    const rawRecent = [good, { nonsense: true }, { games: [], rule: {} }]
    const valid = rawRecent.filter((item) => validateMatchState(item))
    expect(valid).toHaveLength(1)
  })

  it('完全无法解析的 JSON 回退默认值并警告', () => {
    memStore.set(STORAGE_PREFIX + STORAGE_KEYS.currentMatch, 'abc')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallback = { safe: true }
    expect(loadJSON<typeof fallback>(STORAGE_KEYS.currentMatch, fallback)).toBe(fallback)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Timer Runtime：deadline 语义
// ---------------------------------------------------------------------------
describe('Timer Runtime', () => {
  it('同一 phaseKey 重复 sync 不重建 deadline（连续 Pick 不重置）', async () => {
    const { useTimerStore } = await import('../src/store/timerStore')
    const store = useTimerStore
    store.getState().clear()

    store.getState().sync({ phaseKey: 'm1:G1:S4', seconds: 60, enabled: true })
    const d1 = store.getState().deadlineAt
    expect(d1).toBeGreaterThan(Date.now())

    await new Promise((r) => setTimeout(r, 20))
    store.getState().sync({ phaseKey: 'm1:G1:S4', seconds: 60, enabled: true })
    expect(store.getState().deadlineAt).toBe(d1)
  })

  it('phaseKey 变化时重建 deadline（新步骤 / 撤销回退 / 换场）', async () => {
    const { useTimerStore } = await import('../src/store/timerStore')
    const store = useTimerStore
    store.getState().clear()

    store.getState().sync({ phaseKey: 'm1:G1:S4', seconds: 60, enabled: true })
    const d1 = store.getState().deadlineAt!
    await new Promise((r) => setTimeout(r, 20))

    // 进入下一步骤：deadline 必须重建
    store.getState().sync({ phaseKey: 'm1:G1:S5', seconds: 60, enabled: true })
    const d2 = store.getState().deadlineAt!
    expect(d2).toBeGreaterThan(d1)

    // 撤销回退到 S4：同样重建，不会残留 S5 的剩余时间
    await new Promise((r) => setTimeout(r, 20))
    store.getState().sync({ phaseKey: 'm1:G1:S4', seconds: 60, enabled: true })
    const d3 = store.getState().deadlineAt!
    expect(d3).toBeGreaterThan(d2)

    // 换一场比赛（不同 matchId 的 phaseKey）也会重建
    await new Promise((r) => setTimeout(r, 20))
    store.getState().sync({ phaseKey: 'm2:G1:S0', seconds: 60, enabled: true })
    expect(store.getState().deadlineAt!).toBeGreaterThan(d3)
  })

  it('enabled=false 清空 deadline（READY/PLAYING 或关闭计时器时不计时）', async () => {
    const { useTimerStore } = await import('../src/store/timerStore')
    const store = useTimerStore
    store.getState().clear()

    store.getState().sync({ phaseKey: 'm1:G1:S0', seconds: 60, enabled: true })
    expect(store.getState().deadlineAt).not.toBeNull()

    store.getState().sync({ phaseKey: 'm1:G1:DONE', seconds: 60, enabled: false })
    expect(store.getState().deadlineAt).toBeNull()

    // 回到 BP 阶段（如撤销）时恢复计时
    store.getState().sync({ phaseKey: 'm1:G1:S9', seconds: 60, enabled: true })
    expect(store.getState().deadlineAt).not.toBeNull()
  })

  it('deadline 持久化：刷新后可从存储恢复（数据通过 validateTimerState 校验）', async () => {
    const { useTimerStore } = await import('../src/store/timerStore')
    const store = useTimerStore
    store.getState().clear()
    store.getState().sync({ phaseKey: 'm1:G1:S2', seconds: 30, enabled: true })

    const raw = JSON.parse(memStore.get(STORAGE_PREFIX + STORAGE_KEYS.bpTimer)!)
    expect(raw.__v).toBe(STORAGE_SCHEMA_VERSION)
    expect(raw.data.phaseKey).toBe('m1:G1:S2')
    expect(validateTimerState(raw.data)).toBe(true)
    // 已存在的 store 与存储一致
    expect(store.getState().deadlineAt).toBe(raw.data.deadlineAt)
  })
})
