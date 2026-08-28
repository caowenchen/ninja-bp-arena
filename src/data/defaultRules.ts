import type { BattleRule } from '@/types/bp'

/**
 * 武斗赛 BO3 默认模板。
 *
 * Ban（仅第一局）：蓝方×1 → 红方×2 → 蓝方×1，全场持续有效。
 * Pick（每局）：红方×1 → 蓝方×2 → 红方×2 → 蓝方×1。
 *
 * 注意：规则模板可以在设置页修改，这里只是默认值，
 * 不代表永远有效的官方最新规则。
 */
export const DEFAULT_RULE: BattleRule = {
  id: 'wudou-bo3-default',
  name: '武斗赛 BO3 默认模板',
  version: '1.0',

  bestOf: 3,
  winsRequired: 2,

  banOnlyFirstGame: true,
  banPersistence: true,
  usedNinjaLocked: true,

  bansPerPlayer: 2,
  picksPerPlayer: 3,

  banSequence: [
    { side: 'BLUE', action: 'BAN', count: 1 },
    { side: 'RED', action: 'BAN', count: 2 },
    { side: 'BLUE', action: 'BAN', count: 1 },
  ],
  pickSequence: [
    { side: 'RED', action: 'PICK', count: 1 },
    { side: 'BLUE', action: 'PICK', count: 2 },
    { side: 'RED', action: 'PICK', count: 2 },
    { side: 'BLUE', action: 'PICK', count: 1 },
  ],

  timerEnabled: true,
  timerSeconds: 60,
}

export function cloneRule(rule: BattleRule): BattleRule {
  return JSON.parse(JSON.stringify(rule)) as BattleRule
}
