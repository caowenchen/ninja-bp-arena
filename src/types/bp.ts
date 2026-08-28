export type Side = 'BLUE' | 'RED'
export type BPActionType = 'BAN' | 'PICK'

/** 比赛整体状态 */
export type MatchStatus = 'SETUP' | 'IN_PROGRESS' | 'MATCH_FINISHED'

/**
 * 单局展示状态（由引擎根据 BP 进度推导，不单独存储）：
 * BANNING / PICKING：BP 进行中
 * READY：双方阵容锁定，等待进入比赛
 * PLAYING：本局对局进行中
 * COMPLETED：本局已记录胜负
 */
export type GameStatus = 'BANNING' | 'PICKING' | 'READY' | 'PLAYING' | 'COMPLETED'

/** BP 序列中的一个步骤，例如 { side: 'RED', action: 'BAN', count: 2 } */
export interface BPSequenceStep {
  side: Side
  action: BPActionType
  count: number
}

/**
 * 比赛规则模板。所有 BP 流程（Ban/Pick 顺序、数量、继承关系、倒计时）
 * 都由该配置驱动，UI 与引擎不允许硬编码比赛流程。
 */
export interface BattleRule {
  id: string
  name: string
  version: string

  bestOf: number
  winsRequired: number

  /** Ban 是否只出现在第一局 */
  banOnlyFirstGame: boolean
  /** 已做的 Ban 是否跨局持续生效 */
  banPersistence: boolean
  /** 之前小局出过场的忍者是否整场禁用 */
  usedNinjaLocked: boolean

  bansPerPlayer: number
  picksPerPlayer: number

  banSequence: BPSequenceStep[]
  pickSequence: BPSequenceStep[]

  timerEnabled: boolean
  timerSeconds: number
}

/** 一次 Ban / Pick 操作记录 */
export interface BPAction {
  id: string
  gameNumber: number
  side: Side
  action: BPActionType
  ninjaId: string
  timestamp: number
  /** 在整局展开序列中的序号（0 起） */
  sequenceIndex: number
}

export const SIDE_TEXT: Record<Side, string> = { BLUE: '蓝方', RED: '红方' }
export const ACTION_TEXT: Record<BPActionType, string> = { BAN: '禁用', PICK: '选择' }
