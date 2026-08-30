import type { BattleRule } from './types.ts'

/**
 * 忍者池容量需求分析（Shared BP Core）。
 *
 * getMinimumRequiredPoolSize(rule) 返回完成整场比赛（最坏情况）
 * 所需的最少「enabled」忍者数量。房间创建与本地开赛都用它做前置校验，
 * 避免比赛进行到一半因池子枯竭而无法继续。
 *
 * 算法（保守上界，宁多勿少）：
 * - 赛局数按最坏情况 = bestOf（全部打满，如 BO3 打到 2:1）。
 * - Ban 需求：
 *   - banSequence 的 Ban 总量在第 1 局产生。
 *   - banOnlyFirstGame=false 且 banPersistence=false 时，之前局的 Ban
 *     不再占用，之后每一局都需要全新 Ban 名额，按剩余局数累加。
 *   - banPersistence=true 时旧 Ban 持续占用，后续局的 Ban 尝试会因
 *     「已禁用」被引擎拒绝，不会新增占用，因此只计一次。
 * - Pick 需求：
 *   - usedNinjaLocked=true：跨局不可复用，按 局数 × 每局 Pick 总量。
 *   - usedNinjaLocked=false：跨局可复用，只需一局的 Pick 总量。
 *
 * 示例（默认武斗赛 BO3：Ban 蓝1红2蓝1 = 4，每局 Pick 6，USED 锁定）：
 *   4 + 6 × 3 = 22。
 */
export function getMinimumRequiredPoolSize(rule: BattleRule): number {
  const bansPerGame = rule.banSequence.reduce((sum, s) => sum + s.count, 0)
  const picksPerGame = rule.pickSequence.reduce((sum, s) => sum + s.count, 0)

  let banTotal = bansPerGame
  if (!rule.banOnlyFirstGame && !rule.banPersistence) {
    // 每一局都要全新的 Ban 名额（第 1 局之外再补 bestOf-1 局）
    banTotal += bansPerGame * (rule.bestOf - 1)
  }

  const picksTotal = rule.usedNinjaLocked ? picksPerGame * rule.bestOf : picksPerGame

  return banTotal + picksTotal
}

/** 统计忍者池中可用（enabled）且 ID 唯一的忍者数量 */
export function countEnabledNinjas(pool: { id: string; enabled?: boolean }[]): number {
  const ids = new Set<string>()
  for (const n of pool) {
    if (n.enabled !== false && n.id) ids.add(n.id)
  }
  return ids.size
}
