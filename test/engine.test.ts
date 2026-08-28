import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NINJA_POOL } from '../src/data/ninjas'
import { DEFAULT_RULE, cloneRule } from '../src/data/defaultRules'
import {
  canSelectNinja,
  createMatch,
  enterGame,
  getNinjaCardStatus,
  getPhase,
  getUnavailableReason,
  nextGame,
  selectNinja,
  setGameWinner,
  startMatch,
} from '../src/engine/bpEngine'
import { buildShareText, emptyStacks, groupHistoryByGame, recordSnapshot, undo } from '../src/engine/historyEngine'
import { describeSequence, parseSequenceSteps, validateBattleRule } from '../src/engine/ruleEngine'
import { STORAGE_PREFIX, loadJSON, saveJSON, STORAGE_KEYS } from '../src/utils/storage'
import type { MatchState } from '../src/types/match'
import type { Ninja } from '../src/types/ninja'

// ---------------------------------------------------------------------------
// 测试环境：localStorage 内存桩（场景 H / I 需要）
// ---------------------------------------------------------------------------
const memStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => void memStore.clear(),
})

beforeEach(() => {
  memStore.clear()
})

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function newMatch(): MatchState {
  return startMatch(createMatch(cloneRule(DEFAULT_RULE)))
}

function N(name: string): Ninja {
  const ninja = NINJA_POOL.find((n) => n.name === name)
  if (!ninja) throw new Error(`测试数据缺少忍者：${name}`)
  return ninja
}

function doSelect(m: MatchState, name: string): MatchState {
  const ninja = N(name)
  const result = selectNinja(m, ninja.id, ninja)
  if (!result.ok || !result.state) throw new Error(`操作失败：${name} → ${result.reason}`)
  return result.state
}

/** 当前阶段的 “行动方:动作”，用于断言顺序 */
function phaseTag(m: MatchState): string {
  const p = getPhase(m)
  return `${p.side}:${p.action}`
}

const bannedNames = ['漩涡鸣人', '宇智波佐助', '旗木卡卡西', '宇智波鼬']

// ---------------------------------------------------------------------------
// 场景 A：Game1 完整 BP 流程 + 连续动作（场景 F 一并覆盖）
// ---------------------------------------------------------------------------
describe('场景 A/F：Game1 完整 Ban/Pick 流程', () => {
  it('按 蓝B1 → 红B2 → 蓝B1 → 红P1 → 蓝P2 → 红P2 → 蓝P1 顺序执行', () => {
    let m = newMatch()

    // Ban 阶段：BLUE BAN ×1
    expect(phaseTag(m)).toBe('BLUE:BAN')
    m = doSelect(m, '漩涡鸣人')

    // RED BAN ×2：第一次 Ban 后必须仍在红方（场景 F）
    expect(phaseTag(m)).toBe('RED:BAN')
    m = doSelect(m, '宇智波佐助')
    expect(phaseTag(m)).toBe('RED:BAN')
    expect(getPhase(m).remainingInStep).toBe(1)
    m = doSelect(m, '旗木卡卡西')

    // BLUE BAN ×1
    expect(phaseTag(m)).toBe('BLUE:BAN')
    m = doSelect(m, '宇智波鼬')

    // Pick 阶段：RED PICK ×1
    expect(phaseTag(m)).toBe('RED:PICK')
    m = doSelect(m, '自来也')
    // Ban 阶段结束后，被禁用的忍者依然给出明确禁用原因
    expect(getUnavailableReason(m, N('漩涡鸣人').id, N('漩涡鸣人'))).toBe('该忍者已被禁用')
    // 对方已选择的忍者，轮到蓝方时不可选
    expect(getUnavailableReason(m, N('自来也').id, N('自来也'))).toBe('对方已选择该忍者')

    // BLUE PICK ×2：第一次 Pick 后不得切到红方（场景 F）
    expect(phaseTag(m)).toBe('BLUE:PICK')
    m = doSelect(m, '纲手')
    expect(phaseTag(m)).toBe('BLUE:PICK')
    m = doSelect(m, '大蛇丸')

    // RED PICK ×2
    expect(phaseTag(m)).toBe('RED:PICK')
    m = doSelect(m, '我爱罗')
    expect(phaseTag(m)).toBe('RED:PICK')
    m = doSelect(m, '迪达拉')

    // BLUE PICK ×1
    expect(phaseTag(m)).toBe('BLUE:PICK')
    m = doSelect(m, '蝎')

    // BP 完成 → GAME READY
    const phase = getPhase(m)
    expect(phase.sequenceComplete).toBe(true)
    expect(phase.status).toBe('READY')

    // 阵容归属
    const game = m.games[0]
    expect(game.blue.picks).toEqual([N('纲手').id, N('大蛇丸').id, N('蝎').id])
    expect(game.red.picks).toEqual([N('自来也').id, N('我爱罗').id, N('迪达拉').id])
    expect(game.blue.bans).toHaveLength(2)
    expect(game.red.bans).toHaveLength(2)

    // Ban 的忍者不可选，且状态标记为 BANNED
    for (const name of bannedNames) {
      expect(getNinjaCardStatus(m, N(name)).status).toBe('BANNED')
      expect(canSelectNinja(m, N(name).id, N(name)).allowed).toBe(false)
    }
    // 双方出场忍者状态正确
    expect(getNinjaCardStatus(m, N('纲手')).status).toBe('BLUE_PICKED')
    expect(getNinjaCardStatus(m, N('蝎')).status).toBe('BLUE_PICKED')
    expect(getNinjaCardStatus(m, N('自来也')).status).toBe('RED_PICKED')
    expect(getNinjaCardStatus(m, N('迪达拉')).status).toBe('RED_PICKED')
    // READY 阶段统一提示阵容已锁定
    expect(getUnavailableReason(m, N('漩涡鸣人').id, N('漩涡鸣人'))).toBe('双方阵容已锁定')
  })

  it('历史记录完整且按序编号', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)

    expect(m.history).toHaveLength(10)
    expect(m.history[0]).toMatchObject({ side: 'BLUE', action: 'BAN', sequenceIndex: 0 })
    expect(m.history[2]).toMatchObject({ side: 'RED', action: 'BAN', sequenceIndex: 2 })
    expect(m.history[9]).toMatchObject({ side: 'BLUE', action: 'PICK', sequenceIndex: 9 })

    const groups = groupHistoryByGame(m)
    expect(groups).toHaveLength(1)
    expect(groups[0].gameNumber).toBe(1)
    expect(groups[0].actions).toHaveLength(10)
  })
})

// ---------------------------------------------------------------------------
// 场景 B：Game1 蓝方获胜 → Game2（Ban 保持，Game1 出场忍者 USED）
// ---------------------------------------------------------------------------
describe('场景 B：进入 Game2', () => {
  function playGame1(m: MatchState): MatchState {
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)
    const entered = enterGame(m)
    expect(entered.ok).toBe(true)
    const won = setGameWinner(entered.state!, 'BLUE')
    expect(won.ok).toBe(true)
    return won.state!
  }

  it('Ban 保持禁用，Game1 出场忍者变为 USED，全新阶段从 RED PICK 开始', () => {
    let m = playGame1(newMatch())

    expect(m.score).toEqual({ blue: 1, red: 0 })
    expect(m.status).toBe('IN_PROGRESS')

    const next = nextGame(m)
    expect(next.ok).toBe(true)
    m = next.state!

    expect(m.currentGame).toBe(2)
    expect(phaseTag(m)).toBe('RED:PICK')

    // Game1 的 Ban 依旧禁用
    for (const name of bannedNames) {
      expect(getUnavailableReason(m, N(name).id, N(name))).toBe('该忍者已被禁用')
      expect(getNinjaCardStatus(m, N(name)).status).toBe('BANNED')
    }
    // Game1 出场的 6 名忍者全部不可再次使用
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) {
      expect(getUnavailableReason(m, N(name).id, N(name))).toBe('该忍者已在之前小局出战')
      expect(getNinjaCardStatus(m, N(name)).status).toBe('USED')
    }
    // 未使用忍者可选
    expect(canSelectNinja(m, N('干柿鬼鲛').id, N('干柿鬼鲛')).allowed).toBe(true)
  })

  it('READY 阶段不能直接记录胜负，必须先进入比赛', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)

    const result = setGameWinner(m, 'BLUE')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('本局尚未进入比赛')
    // 失败操作不改变状态
    expect(m.score).toEqual({ blue: 0, red: 0 })
  })
})

// ---------------------------------------------------------------------------
// 场景 C：Game2 红方获胜 → 1:1 → Game3（累计使用全部禁用）
// ---------------------------------------------------------------------------
describe('场景 C：Game3 的累计禁用', () => {
  const game2Picks = ['干柿鬼鲛', '油女志乃', '药师兜', '静音', '李洛克', '天天']
  const game3Picks = ['奈良鹿丸', '秋道丁次', '山中井野', '犬冢牙', '飞段', '角都']

  it('Game1 + Game2 所有已使用忍者均不可用，Ban 保持', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)
    m = setGameWinner(enterGame(m).state!, 'BLUE').state!
    m = nextGame(m).state!

    // Game2：红P1 蓝 P2 红P2 蓝P1
    for (const name of game2Picks) m = doSelect(m, name)
    expect(getPhase(m).sequenceComplete).toBe(true)
    m = setGameWinner(enterGame(m).state!, 'RED').state!
    expect(m.score).toEqual({ blue: 1, red: 1 })

    m = nextGame(m).state!
    expect(m.currentGame).toBe(3)
    expect(phaseTag(m)).toBe('RED:PICK')

    // Ban 仍然保持
    for (const name of bannedNames) {
      expect(getUnavailableReason(m, N(name).id, N(name))).toBe('该忍者已被禁用')
    }
    // Game1 + Game2 全部 12 名出场忍者不可用
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎', ...game2Picks]) {
      expect(getUnavailableReason(m, N(name).id, N(name))).toBe('该忍者已在之前小局出战')
    }
    // Game3 剩余忍者可选
    for (const name of game3Picks) {
      expect(canSelectNinja(m, N(name).id, N(name)).allowed).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 场景 D：Game3 蓝方获胜 → 2:1 → MATCH_FINISHED
// ---------------------------------------------------------------------------
describe('场景 D：比赛结束', () => {
  it('比分 2:1，不能再 Pick，也不能进入下一局', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)
    m = setGameWinner(enterGame(m).state!, 'BLUE').state!
    m = nextGame(m).state!
    for (const name of ['干柿鬼鲛', '油女志乃', '药师兜', '静音', '李洛克', '天天']) m = doSelect(m, name)
    m = setGameWinner(enterGame(m).state!, 'RED').state!
    m = nextGame(m).state!
    for (const name of ['奈良鹿丸', '秋道丁次', '山中井野', '犬冢牙', '飞段', '角都']) m = doSelect(m, name)

    const result = setGameWinner(enterGame(m).state!, 'BLUE')
    expect(result.ok).toBe(true)
    m = result.state!

    expect(m.score).toEqual({ blue: 2, red: 1 })
    expect(m.status).toBe('MATCH_FINISHED')

    const anyNinja = N('漩涡鸣人')
    const check = canSelectNinja(m, anyNinja.id, anyNinja)
    expect(check.allowed).toBe(false)
    expect(check.reason).toBe('比赛已经结束')

    const again = nextGame(m)
    expect(again.ok).toBe(false)
    expect(again.reason).toBe('比赛已经结束')
  })
})

// ---------------------------------------------------------------------------
// 场景 E：撤销
// ---------------------------------------------------------------------------
describe('场景 E：撤销', () => {
  it('撤销 Ban 后忍者重新可用，阶段正确回退，可改选他人', () => {
    let m = newMatch()
    let stacks = emptyStacks()
    stacks = recordSnapshot(stacks, m)
    m = doSelect(m, '漩涡鸣人')
    expect(getUnavailableReason(m, N('漩涡鸣人').id, N('漩涡鸣人'))).toBe('该忍者已被禁用')
    expect(phaseTag(m)).toBe('RED:BAN')

    const r = undo(m, stacks)
    expect(r.ok).toBe(true)
    m = r.state!
    stacks = r.stacks

    // 撤销后：A 重新可用，阶段回到 BLUE BAN，历史清空
    expect(canSelectNinja(m, N('漩涡鸣人').id, N('漩涡鸣人')).allowed).toBe(true)
    expect(phaseTag(m)).toBe('BLUE:BAN')
    expect(m.history).toHaveLength(0)
    expect(m.games[0].blue.bans).toHaveLength(0)

    // 改选 B，状态正常
    stacks = recordSnapshot(stacks, m)
    m = doSelect(m, '宇智波佐助')
    expect(m.games[0].blue.bans).toEqual([N('宇智波佐助').id])
    expect(getUnavailableReason(m, N('漩涡鸣人').id, N('漩涡鸣人'))).toBeNull()
    // 此后不再使用 stacks，仅为保持快照栈语义而更新
    expect(stacks.past.length).toBeGreaterThan(0)
  })

  it('撤销可跨过 记录胜负 / 下一局 边界', () => {
    let m = newMatch()
    let stacks = emptyStacks()
    const snap = () => {
      stacks = recordSnapshot(stacks, m)
    }

    for (const name of bannedNames) {
      snap()
      m = doSelect(m, name)
    }
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) {
      snap()
      m = doSelect(m, name)
    }
    snap()
    m = enterGame(m).state!
    snap()
    m = setGameWinner(m, 'BLUE').state!
    snap()
    m = nextGame(m).state!
    expect(m.currentGame).toBe(2)

    // 撤销 Game2 的一次 Pick
    snap()
    m = doSelect(m, '干柿鬼鲛')
    let r = undo(m, stacks)
    m = r.state!
    stacks = r.stacks
    expect(m.currentGame).toBe(2)
    expect(m.games[1].red.picks).toHaveLength(0)

    // 再撤销 → 回到 Game1 已记录胜负
    r = undo(m, stacks)
    m = r.state!
    stacks = r.stacks
    expect(m.currentGame).toBe(1)
    expect(m.games[0].winner).toBe('BLUE')
    expect(m.score).toEqual({ blue: 1, red: 0 })

    // 再撤销 → 回到 Game1 PLAYING（胜负已撤销但仍在比赛中）
    r = undo(m, stacks)
    m = r.state!
    stacks = r.stacks
    expect(m.games[0].winner).toBeUndefined()
    expect(m.score).toEqual({ blue: 0, red: 0 })
    expect(getPhase(m).status).toBe('PLAYING')

    // 再撤销一次 → 回到 GAME READY（尚未进入比赛）
    r = undo(m, stacks)
    m = r.state!
    expect(getPhase(m).status).toBe('READY')
    expect(m.games[0].started).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 场景 G：非法操作不破坏状态
// ---------------------------------------------------------------------------
describe('场景 G：非法操作', () => {
  it('Pick 已 Ban / 对方已选 / 己方已选 / USED / 结束后 均被拒绝', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    m = doSelect(m, '自来也') // 红方 PICK 1

    // 已 Ban 的忍者
    const bannedNinja = N('漩涡鸣人')
    const before1 = JSON.stringify(m)
    let r = selectNinja(m, bannedNinja.id, bannedNinja)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('该忍者已被禁用')

    // 对方（红方）已选择的忍者，轮到蓝方
    const redPicked = N('自来也')
    r = selectNinja(m, redPicked.id, redPicked)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('对方已选择该忍者')

    // 蓝方连续选择：第二次选同一人 → 己方已选择
    m = doSelect(m, '纲手')
    r = selectNinja(m, N('纲手').id, N('纲手'))
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('己方已选择该忍者')

    // 不存在的忍者
    r = selectNinja(m, 'no-such-ninja')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('忍者不存在')

    // 非法操作后状态未被破坏（成功操作：4 Ban + 自来也 + 纲手 = 6 条历史）
    expect(JSON.stringify(m)).not.toBe(before1) // 中途有一次成功操作
    expect(m.history).toHaveLength(6)
    expect(phaseTag(m)).toBe('BLUE:PICK')

    // USED：进入 Game2 后试图再选 Game1 出场忍者
    for (const name of ['大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)
    m = setGameWinner(enterGame(m).state!, 'RED').state!
    m = nextGame(m).state!
    const usedNinja = N('纲手')
    const before2 = JSON.stringify(m)
    r = selectNinja(m, usedNinja.id, usedNinja)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('该忍者已在之前小局出战')
    expect(JSON.stringify(m)).toBe(before2) // 状态完全未变

    // 比赛结束后（构造 2:0）仍试图操作
    m = doSelect(m, '干柿鬼鲛')
    m = doSelect(m, '油女志乃')
    m = doSelect(m, '药师兜')
    m = doSelect(m, '静音')
    m = doSelect(m, '李洛克')
    m = doSelect(m, '天天')
    m = setGameWinner(enterGame(m).state!, 'RED').state! // 红方 2:0
    expect(m.status).toBe('MATCH_FINISHED')
    r = selectNinja(m, N('奈良鹿丸').id, N('奈良鹿丸'))
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('比赛已经结束')
  })
})

// ---------------------------------------------------------------------------
// 场景 H：刷新恢复（序列化往返）
// ---------------------------------------------------------------------------
describe('场景 H：刷新恢复', () => {
  it('保存到 localStorage 后重新加载，阶段 / 比分 / Ban / Pick 完整还原', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    m = doSelect(m, '自来也')

    saveJSON(STORAGE_KEYS.currentMatch, m)

    // 模拟刷新：从存储重新读出
    const restored = loadJSON<MatchState | null>(STORAGE_KEYS.currentMatch, null)
    expect(restored).not.toBeNull()

    const phaseBefore = getPhase(m)
    const phaseAfter = getPhase(restored!)
    expect(phaseAfter.side).toBe(phaseBefore.side)
    expect(phaseAfter.action).toBe(phaseBefore.action)
    expect(phaseAfter.stepIndex).toBe(phaseBefore.stepIndex)
    expect(phaseAfter.totalDone).toBe(phaseBefore.totalDone)
    expect(restored!.games[0].blue.bans).toEqual(m.games[0].blue.bans)

    // 恢复后可继续操作，且后续流程一致
    const continued = selectNinja(restored!, N('纲手').id, N('纲手'))
    expect(continued.ok).toBe(true)
    expect(phaseTag(continued.state!)).toBe('BLUE:PICK')
  })
})

// ---------------------------------------------------------------------------
// 场景 I：损坏数据
// ---------------------------------------------------------------------------
describe('场景 I：损坏的本地数据', () => {
  it('localStorage 值为非法 JSON 时不崩溃，回退默认值并警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    memStore.set('ninja-bp.current_match', 'abc')

    const fallback = { safe: true }
    const loaded = loadJSON<typeof fallback>(STORAGE_KEYS.currentMatch, fallback)
    expect(loaded).toBe(fallback)
    expect(warnSpy).toHaveBeenCalled()

    // 形状不合法的 JSON 也应回退
    memStore.set(STORAGE_PREFIX + STORAGE_KEYS.currentMatch, JSON.stringify({ nonsense: 1 }))
    const loaded2 = loadJSON<MatchState | null>(STORAGE_KEYS.currentMatch, null, (v) => {
      return typeof v === 'object' && v !== null && 'games' in v
    })
    expect(loaded2).toBeNull()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// 规则引擎补充测试
// ---------------------------------------------------------------------------
describe('规则引擎', () => {
  it('默认规则合法，序列描述可读', () => {
    expect(validateBattleRule(DEFAULT_RULE)).toEqual([])
    expect(describeSequence(DEFAULT_RULE.banSequence)).toBe('蓝方 禁用×1 → 红方 禁用×2 → 蓝方 禁用×1')
    expect(describeSequence(DEFAULT_RULE.pickSequence)).toBe('红方 选择×1 → 蓝方 选择×2 → 红方 选择×2 → 蓝方 选择×1')
  })

  it('序列校验能拦截非法配置', () => {
    const bad = parseSequenceSteps([{ side: 'BLUE', action: 'PICK', count: 1 }], 'banSequence', 'BAN')
    expect(bad.steps).toBeUndefined()
    expect(bad.errors).toHaveLength(1)

    const badCount = parseSequenceSteps([{ side: 'RED', action: 'BAN', count: 0 }], 'banSequence', 'BAN')
    expect(badCount.steps).toBeUndefined()

    const good = parseSequenceSteps(
      [
        { side: 'BLUE', action: 'BAN', count: 2 },
        { side: 'RED', action: 'BAN', count: 2 },
      ],
      'banSequence',
      'BAN',
    )
    expect(good.steps).toHaveLength(2)
    expect(good.errors).toEqual([])
  })

  it('createMatch 深拷贝规则，之后修改模板不影响进行中的比赛', () => {
    const rule = cloneRule(DEFAULT_RULE)
    const m = createMatch(rule)
    rule.timerSeconds = 15
    rule.pickSequence[0].count = 5
    expect(m.rule.timerSeconds).toBe(60)
    expect(m.rule.pickSequence[0].count).toBe(1)
  })

  it('分享文本包含比分 / 阵容 / 胜者', () => {
    let m = newMatch()
    for (const name of bannedNames) m = doSelect(m, name)
    for (const name of ['自来也', '纲手', '大蛇丸', '我爱罗', '迪达拉', '蝎']) m = doSelect(m, name)
    m = setGameWinner(enterGame(m).state!, 'BLUE').state!

    const text = buildShareText(m, (id) => NINJA_POOL.find((n) => n.id === id)?.name ?? id)
    expect(text).toContain('忍界 BP｜武斗赛模拟结果')
    expect(text).toContain('蓝方 1 : 0 红方')
    expect(text).toContain('胜者：蓝方')
    expect(text).toContain('1. 纲手')
    expect(text).toContain('非官方')
  })
})
