import type { BattleRule, BPAction, MatchStatus, Side, BPActionType } from '@/types/bp'
import type { NinjaQuality } from '@/types/ninja'
import { validateBattleRule } from './ruleEngine'

/**
 * 持久化数据的运行时校验。
 *
 * localStorage 里的数据永远不可信：只判断“字段是否存在”会让
 * {"games":[],"rule":{}} 这类合法 JSON 穿透进业务状态，
 * 导致 getCurrentGame() 拿到 undefined。这里做完整结构校验，
 * 校验失败的数据一律在加载层被丢弃并回退默认值。
 */

const MATCH_STATUSES: MatchStatus[] = ['SETUP', 'IN_PROGRESS', 'MATCH_FINISHED']
const SIDES: Side[] = ['BLUE', 'RED']
const ACTIONS: BPActionType[] = ['BAN', 'PICK']
const QUALITIES = ['S', 'A', 'B', 'C']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string')
}

/** 校验单个 GameState */
function isValidGameState(game: unknown, bestOf: number): boolean {
  if (!isRecord(game)) return false
  if (!isNonNegativeInt(game.gameNumber) || game.gameNumber < 1 || game.gameNumber > bestOf) return false
  if (game.started !== undefined && typeof game.started !== 'boolean') return false
  if (game.winner !== undefined && game.winner !== 'BLUE' && game.winner !== 'RED') return false
  for (const side of ['blue', 'red'] as const) {
    const player = game[side]
    if (!isRecord(player)) return false
    if (!isStringArray(player.bans) || !isStringArray(player.picks)) return false
  }
  return true
}

/** 校验单个 BPAction */
function isValidBPAction(action: unknown): boolean {
  if (!isRecord(action)) return false
  if (!isNonEmptyString(action.id)) return false
  if (!isNonNegativeInt(action.gameNumber) || action.gameNumber < 1) return false
  if (!SIDES.includes(action.side as Side)) return false
  if (!ACTIONS.includes(action.action as BPActionType)) return false
  if (!isNonEmptyString(action.ninjaId)) return false
  if (typeof action.timestamp !== 'number') return false
  if (!isNonNegativeInt(action.sequenceIndex)) return false
  return true
}

/** 校验存储中的 BattleRule（结构 + 业务规则双重校验） */
export function validateStoredRule(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return false
  if (typeof value.version !== 'string') return false
  if (!isNonNegativeInt(value.bestOf) || !isNonNegativeInt(value.winsRequired)) return false
  if (
    typeof value.banOnlyFirstGame !== 'boolean' ||
    typeof value.banPersistence !== 'boolean' ||
    typeof value.usedNinjaLocked !== 'boolean' ||
    typeof value.timerEnabled !== 'boolean'
  ) {
    return false
  }
  if (!isNonNegativeInt(value.timerSeconds)) return false
  if (!Array.isArray(value.banSequence) || !Array.isArray(value.pickSequence)) return false
  return validateBattleRule(value as unknown as BattleRule).length === 0
}

/**
 * 严格校验一场比赛的持久化数据。
 * 任何一层不合法都返回 false，由加载层整体丢弃。
 */
export function validateMatchState(value: unknown): boolean {
  if (!isRecord(value)) return false

  if (!isNonEmptyString(value.id)) return false
  if (!validateStoredRule(value.rule)) return false
  if (typeof value.bluePlayerName !== 'string' || typeof value.redPlayerName !== 'string') return false

  // 比分
  if (!isRecord(value.score)) return false
  if (!isNonNegativeInt(value.score.blue) || !isNonNegativeInt(value.score.red)) return false

  // 局数
  if (!isNonNegativeInt(value.currentGame) || value.currentGame < 1) return false
  if (typeof value.status !== 'string' || !MATCH_STATUSES.includes(value.status as MatchStatus)) return false

  // games：至少一局，且 currentGame 必须指向最后一局
  if (!Array.isArray(value.games) || value.games.length === 0) return false
  const rule = value.rule as unknown as BattleRule
  for (const game of value.games) {
    if (!isValidGameState(game, rule.bestOf + 1)) return false
  }
  const lastGame = value.games[value.games.length - 1] as Record<string, unknown>
  if (lastGame.gameNumber !== value.currentGame) return false

  // history
  if (!Array.isArray(value.history)) return false
  for (const action of value.history) {
    if (!isValidBPAction(action)) return false
  }

  // 时间戳
  if (typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') return false

  return true
}

/** 校验单条忍者数据 */
export function validateNinjaRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.id)) return false
  if (typeof value.name !== 'string' || value.name.trim() === '') return false
  if (typeof value.quality !== 'string' || !QUALITIES.includes(value.quality as NinjaQuality)) return false
  if (!isStringArray(value.tags)) return false
  if (typeof value.enabled !== 'boolean') return false
  if (value.avatar !== undefined && typeof value.avatar !== 'string') return false
  if (value.aliases !== undefined && !isStringArray(value.aliases)) return false
  if (value.sortOrder !== undefined && !isNonNegativeInt(value.sortOrder)) return false
  if (value.remark !== undefined && typeof value.remark !== 'string') return false
  return true
}

/** 校验计时器运行时数据 */
export function validateTimerState(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.phaseKey !== null && !isNonEmptyString(value.phaseKey)) return false
  if (value.deadlineAt !== null && typeof value.deadlineAt !== 'number') return false
  return true
}

/** 类型守卫：通过校验的 MatchState */
export function asMatchState(value: unknown): import('@/types/match').MatchState | null {
  return validateMatchState(value) ? (value as import('@/types/match').MatchState) : null
}

export type { BPAction }
