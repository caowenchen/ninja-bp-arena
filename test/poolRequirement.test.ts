import { describe, expect, it } from 'vitest'
import { DEFAULT_RULE, cloneRule } from '../src/data/defaultRules'
import { getMinimumRequiredPoolSize } from '../supabase/functions/_shared/bp-core/poolRequirement'
import type { BattleRule } from '../supabase/functions/_shared/bp-core/types'

/**
 * Pool Requirement Analyzer（Shared BP Core 纯函数）：
 * 完成整场比赛（最坏情况）所需的最少可用忍者数量。
 */

function ruleWith(overrides: Partial<BattleRule>): BattleRule {
  return { ...cloneRule(DEFAULT_RULE), ...overrides }
}

describe('Pool Requirement Analyzer', () => {
  it('默认武斗赛 BO3：4 Ban + 6 Pick × 3 局 = 22', () => {
    expect(getMinimumRequiredPoolSize(DEFAULT_RULE)).toBe(22)
  })

  it('BO1：4 Ban + 6 Pick × 1 局 = 10', () => {
    expect(getMinimumRequiredPoolSize(ruleWith({ bestOf: 1 }))).toBe(10)
  })

  it('关闭 usedNinjaLocked：Pick 跨局可复用 → 4 + 6 = 10', () => {
    expect(getMinimumRequiredPoolSize(ruleWith({ usedNinjaLocked: false }))).toBe(10)
  })

  it('Ban 不继承且每局重新 Ban：4 × 3 + 18 = 30', () => {
    expect(
      getMinimumRequiredPoolSize(ruleWith({ banPersistence: false, banOnlyFirstGame: false })),
    ).toBe(30)
  })

  it('Ban 每局重新执行但跨局继承：Ban 只计一次 → 22', () => {
    expect(
      getMinimumRequiredPoolSize(ruleWith({ banPersistence: true, banOnlyFirstGame: false })),
    ).toBe(22)
  })

  it('自定义序列：Ban 蓝2红1=3，Pick 蓝2红2=4，BO3 锁定 → 3 + 12 = 15', () => {
    const custom = ruleWith({
      banSequence: [
        { side: 'BLUE', action: 'BAN', count: 2 },
        { side: 'RED', action: 'BAN', count: 1 },
      ],
      pickSequence: [
        { side: 'BLUE', action: 'PICK', count: 2 },
        { side: 'RED', action: 'PICK', count: 2 },
      ],
    })
    expect(getMinimumRequiredPoolSize(custom)).toBe(15)
  })

  it('BO5 默认 Ban/Pick：4 + 6 × 5 = 34', () => {
    expect(getMinimumRequiredPoolSize(ruleWith({ bestOf: 5 }))).toBe(34)
  })

  it('禁用倒计时不影响容量需求', () => {
    expect(getMinimumRequiredPoolSize(ruleWith({ timerEnabled: false }))).toBe(22)
  })
})
