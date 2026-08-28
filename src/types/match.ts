import type { BPAction, BattleRule, MatchStatus, Side } from './bp'

/** 一方在一局内的 BP 结果 */
export interface PlayerGameState {
  bans: string[]
  picks: string[]
}

/** 一局的 BP 状态。started 表示已从 GAME READY 进入比赛阶段。 */
export interface GameState {
  gameNumber: number
  blue: PlayerGameState
  red: PlayerGameState
  winner?: Side
  started: boolean
}

/**
 * 一场完整比赛的状态。
 * 说明：历史使用过的忍者不再单独存一份 usedNinjas，
 * 而是由 games 中各局的 picks 推导（见 bpEngine.getUsedNinjas），
 * 避免两份数据不一致。
 */
export interface MatchState {
  id: string
  rule: BattleRule
  bluePlayerName: string
  redPlayerName: string
  score: { blue: number; red: number }
  currentGame: number
  games: GameState[]
  status: MatchStatus
  history: BPAction[]
  createdAt: number
  updatedAt: number
}

/** 引擎操作的统一返回，UI 据此决定 Toast 提示 */
export interface EngineResult {
  ok: boolean
  state?: MatchState
  reason?: string
}
