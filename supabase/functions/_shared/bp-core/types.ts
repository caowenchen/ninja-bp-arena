/**
 * Shared BP Core —— 类型定义。
 *
 * 本目录是浏览器与 Supabase Edge Function（Deno）共用的纯逻辑层：
 * 不依赖 React / DOM / localStorage / Zustand / window / Vite alias，
 * 只使用相对 import，保证 Browser、Vitest、Deno 三端行为一致。
 */

// ---------------------------------------------------------------------------
// 忍者
// ---------------------------------------------------------------------------

export type NinjaQuality = 'S' | 'A' | 'B' | 'C'

export interface Ninja {
  id: string
  name: string
  /** 别名：用于搜索（如「秽土斑」可指向正式名称），不代表官方设定 */
  aliases?: string[]
  /** 头像：支持 https(s) 远程地址或 /assets/ninjas/xxx.webp 本地资源 */
  avatar?: string
  quality: NinjaQuality
  tags: string[]
  enabled: boolean
  /** 自定义排序权重（小者靠前），可选 */
  sortOrder?: number

  version?: string
  releaseDate?: string
  remark?: string

  // ---- v0.4 数据包字段（全部可选，向后兼容）----
  /** 稳定短标识：搜索 / URL / 展示用；id 才是永久引用，改名时保持 id 不变 */
  slug?: string
  /** 所属系列（如「疾风传」），用于筛选与搜索 */
  series?: string[]
  /** 形态（如「九喇嘛模式」），用于筛选与搜索 */
  forms?: string[]
  /** 定位（如「突进」「消耗」之外的体系定位），用于筛选 */
  roles?: string[]
  /** 品质显示名（数据源原始叫法），仅展示 */
  rarityLabel?: string
  /** 该条数据最后所在的包内容版本（如 2026.08.1） */
  dataVersion?: string
  /** 素材键：配合 manifest.assetBaseUrl 拼出头像 URL，数据 JSON 不写长 URL */
  assetKey?: string
  /** 已下架 / 不再可用：保留记录（历史引用），不出现在可选池 */
  deprecated?: boolean
}

export const NINJA_QUALITIES: NinjaQuality[] = ['S', 'A', 'B', 'C']

// ---------------------------------------------------------------------------
// 规则
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 比赛
// ---------------------------------------------------------------------------

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
 * 在线模式的服务端权威倒计时：
 * deadlineAt 由服务器生成（客户端不可信），客户端只负责显示。
 * 本地模式不使用该字段（本地用 timerStore 持久化）。
 */
export interface MatchTimerState {
  phaseKey: string
  deadlineAt: number | null
  timedOut: boolean
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
  /** 仅在线模式由服务端维护 */
  timer?: MatchTimerState

  // ---- v0.4 比赛数据快照（可选；创建比赛时固化，之后数据包更新不影响进行中/历史比赛）----
  /** 比赛创建时使用的数据包元信息（自定义池无包时可省略） */
  dataPack?: MatchPackMetadata
  /** 比赛创建时的忍者池轻量快照：名称 / 品质 / 头像的显示权威来源 */
  ninjaSnapshot?: OnlineNinjaSnapshot[]
}

/** 比赛记录的数据包元信息（历史比赛据它知道当时用的是哪个数据版本） */
export interface MatchPackMetadata {
  packId: string
  schemaVersion?: number
  packVersion?: string
  checksum?: string
}

/**
 * 在线房间 / 比赛快照使用的忍者轻量对象：
 * 服务端 BP 只需要 id + enabled；UI 显示需要 name / quality / 头像。
 * 绝不允许把 Base64 图片放进该对象（JSONB 体积保护）。
 */
export interface OnlineNinjaSnapshot {
  id: string
  name: string
  enabled: boolean
  quality: NinjaQuality
  avatar?: string
  assetKey?: string
}

/** 引擎操作的统一返回，UI 据此决定 Toast 提示 */
export interface EngineResult {
  ok: boolean
  state?: MatchState
  reason?: string
}
