import type { BPActionType, BattleRule, Side } from './types'
import type { EngineResult, GameState, MatchState } from './types'
import type { Ninja } from './types'
import { expandSequence, type ExpandedAction } from './ruleEngine'

/**
 * BP 引擎：整个项目的核心状态机（Shared BP Core）。
 *
 * 原则：
 * - 纯函数：输入 MatchState，输出新的 MatchState；不依赖 DOM / React /
 *   localStorage / Zustand，浏览器与 Edge Function（Deno）共用同一实现。
 * - 所有可用性判断集中在 canSelectNinja，UI 只消费结果。
 * - 当前阶段（Game / 阶段 / 行动方 / 动作 / 进度）由 BP 进度实时推导，
 *   不保存冗余的 currentStep，避免撤销/恢复时状态错位。
 */

export interface SelectCheck {
  allowed: boolean
  reason?: string
}

const deny = (reason: string): SelectCheck => ({ allowed: false, reason })
const ALLOW: SelectCheck = { allowed: true }

export function cloneMatch<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createGameState(gameNumber: number): GameState {
  return {
    gameNumber,
    blue: { bans: [], picks: [] },
    red: { bans: [], picks: [] },
    started: false,
  }
}

// ---------------------------------------------------------------------------
// 创建 / 开始
// ---------------------------------------------------------------------------

export function createMatch(rule: BattleRule, bluePlayerName = '', redPlayerName = ''): MatchState {
  const now = Date.now()
  return {
    id: makeId('match'),
    // 规则深拷贝进比赛：之后修改规则模板不影响进行中的比赛
    rule: cloneMatch(rule),
    bluePlayerName: bluePlayerName.trim() || '蓝方',
    redPlayerName: redPlayerName.trim() || '红方',
    score: { blue: 0, red: 0 },
    currentGame: 1,
    games: [createGameState(1)],
    status: 'SETUP',
    history: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** 从 SETUP 进入正式比赛（重置比分与第一局） */
export function startMatch(m: MatchState): MatchState {
  return {
    ...cloneMatch(m),
    status: 'IN_PROGRESS',
    currentGame: 1,
    games: [createGameState(1)],
    history: [],
    updatedAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// 阶段推导（状态机核心）
// ---------------------------------------------------------------------------

export function getCurrentGame(m: MatchState): GameState {
  return m.games[m.games.length - 1]
}

/** 本局适用的完整动作序列（含 Ban 阶段与否由规则决定）。
 *  注意：先把两段步骤数组合并成一条序列再展开，
 *  保证 stepIndex 在整局内全局唯一（否则 Ban/Pick 两段的步骤编号会重叠）。 */
export function getGameSequence(m: MatchState, gameNumber: number): ExpandedAction[] {
  const useBans = gameNumber === 1 || !m.rule.banOnlyFirstGame
  const banSteps = useBans ? m.rule.banSequence : []
  return expandSequence([...banSteps, ...m.rule.pickSequence])
}

export interface PhaseInfo {
  gameNumber: number
  status: 'BANNING' | 'PICKING' | 'READY' | 'PLAYING' | 'COMPLETED'
  /** 当前步骤的动作；序列完成后为 null */
  action: BPActionType | null
  /** 当前行动方；序列完成后为 null */
  side: Side | null
  /** 当前处于第几个序列步骤 */
  stepIndex: number | null
  /** 本步骤已完成数 */
  doneInStep: number
  /** 本步骤需要总数（例如 RED PICK×2 为 2） */
  stepCount: number
  /** 本步骤还差几个（“还需选择 N 名忍者”） */
  remainingInStep: number
  totalDone: number
  totalActions: number
  sequenceComplete: boolean
  expanded: ExpandedAction[]
}

/**
 * 推导当前阶段。已完成的动作数 = bans + picks，
 * 与展开序列逐一对应，因此撤销之后阶段自然回退，永不错乱。
 */
export function getPhase(m: MatchState): PhaseInfo {
  const game = getCurrentGame(m)
  const expanded = getGameSequence(m, game.gameNumber)
  const totalDone =
    game.blue.bans.length + game.red.bans.length + game.blue.picks.length + game.red.picks.length
  const base = {
    gameNumber: game.gameNumber,
    totalDone,
    totalActions: expanded.length,
    expanded,
  }

  if (totalDone >= expanded.length) {
    const status = game.winner ? 'COMPLETED' : game.started ? 'PLAYING' : 'READY'
    return {
      ...base,
      status,
      action: null,
      side: null,
      stepIndex: null,
      doneInStep: 0,
      stepCount: 0,
      remainingInStep: 0,
      sequenceComplete: true,
    }
  }

  const current = expanded[totalDone]
  // 同一 stepIndex 的动作在展开序列里必然连续
  const stepStart = expanded.findIndex((e) => e.stepIndex === current.stepIndex)
  const stepCount = expanded.filter((e) => e.stepIndex === current.stepIndex).length
  const doneInStep = totalDone - stepStart
  return {
    ...base,
    status: current.action === 'BAN' ? 'BANNING' : 'PICKING',
    action: current.action,
    side: current.side,
    stepIndex: current.stepIndex,
    doneInStep,
    stepCount,
    remainingInStep: stepCount - doneInStep,
    sequenceComplete: false,
  }
}

/** 之前小局已经出场的忍者（不含当前局） */
export function getUsedNinjas(m: MatchState): { blue: string[]; red: string[] } {
  const currentNumber = getCurrentGame(m).gameNumber
  const blue: string[] = []
  const red: string[] = []
  for (const g of m.games) {
    if (g.gameNumber === currentNumber) continue
    blue.push(...g.blue.picks)
    red.push(...g.red.picks)
  }
  return { blue, red }
}

// ---------------------------------------------------------------------------
// 可用性校验
// ---------------------------------------------------------------------------

/**
 * 判断某忍者当前能否被选择 / 禁用，失败时给出明确原因。
 * 校验顺序经过设计，保证提示与玩家直觉一致。
 */
export function canSelectNinja(m: MatchState, ninjaId: string, ninja?: Ninja): SelectCheck {
  if (m.status === 'SETUP') return deny('比赛尚未开始')
  if (m.status === 'MATCH_FINISHED') return deny('比赛已经结束')

  const game = getCurrentGame(m)
  if (game.winner) return deny('本局比赛已结束')

  const phase = getPhase(m)
  if (phase.sequenceComplete) {
    return deny(game.started ? '比赛进行中，无法进行 BP 操作' : '双方阵容已锁定')
  }

  if (!ninja) return deny('忍者不存在')
  if (!ninja.enabled) return deny('该忍者已被停用')

  // 已被 Ban：当前局的 Ban 一定生效；历史 Ban 仅在规则允许继承时生效
  for (const g of m.games) {
    const banned = g.blue.bans.includes(ninjaId) || g.red.bans.includes(ninjaId)
    if (!banned) continue
    if (g.gameNumber === game.gameNumber || m.rule.banPersistence) {
      return deny('该忍者已被禁用')
    }
  }

  // 同一小局内双方不能选择同一忍者
  if (game.blue.picks.includes(ninjaId) || game.red.picks.includes(ninjaId)) {
    const mine = phase.side ? game[phase.side === 'BLUE' ? 'blue' : 'red'].picks.includes(ninjaId) : false
    return deny(mine ? '己方已选择该忍者' : '对方已选择该忍者')
  }

  // 之前小局出过场的忍者整场禁用（可配置关闭）
  if (m.rule.usedNinjaLocked) {
    for (const g of m.games) {
      if (g.gameNumber === game.gameNumber) continue
      if (g.blue.picks.includes(ninjaId) || g.red.picks.includes(ninjaId)) {
        return deny('该忍者已在之前小局出战')
      }
    }
  }

  return ALLOW
}

/** 忍者卡片展示状态（视觉层） */
export type NinjaCardStatus = 'AVAILABLE' | 'BANNED' | 'BLUE_PICKED' | 'RED_PICKED' | 'USED' | 'DISABLED'

export interface NinjaStatusInfo {
  status: NinjaCardStatus
  reason: string
}

export function getNinjaCardStatus(m: MatchState, ninja: Ninja): NinjaStatusInfo {
  if (!ninja.enabled) return { status: 'DISABLED', reason: '该忍者已被停用' }

  const game = getCurrentGame(m)
  const currentNumber = game.gameNumber

  for (const g of m.games) {
    const banned = g.blue.bans.includes(ninja.id) || g.red.bans.includes(ninja.id)
    if (banned && (g.gameNumber === currentNumber || m.rule.banPersistence)) {
      return { status: 'BANNED', reason: '该忍者已被禁用' }
    }
  }

  if (game.blue.picks.includes(ninja.id)) return { status: 'BLUE_PICKED', reason: '蓝方已选择' }
  if (game.red.picks.includes(ninja.id)) return { status: 'RED_PICKED', reason: '红方已选择' }

  if (m.rule.usedNinjaLocked) {
    for (const g of m.games) {
      if (g.gameNumber === currentNumber) continue
      if (g.blue.picks.includes(ninja.id) || g.red.picks.includes(ninja.id)) {
        return { status: 'USED', reason: '该忍者已在之前小局出战' }
      }
    }
  }

  return { status: 'AVAILABLE', reason: '' }
}

export function getAvailableNinjas(m: MatchState, pool: Ninja[]): Ninja[] {
  return pool.filter((n) => canSelectNinja(m, n.id, n).allowed)
}

export function getUnavailableReason(m: MatchState, ninjaId: string, ninja?: Ninja): string | null {
  const check = canSelectNinja(m, ninjaId, ninja)
  return check.allowed ? null : check.reason ?? null
}

// ---------------------------------------------------------------------------
// BP 操作
// ---------------------------------------------------------------------------

const fail = (reason: string): EngineResult => ({ ok: false, reason })

/**
 * 按当前阶段执行 Ban 或 Pick：阶段是 BAN 就禁用，是 PICK 就选择。
 * 点击哪个忍者由 UI 决定，属于哪一方由引擎的阶段推导决定。
 */
export function selectNinja(m: MatchState, ninjaId: string, ninja?: Ninja): EngineResult {
  const check = canSelectNinja(m, ninjaId, ninja)
  if (!check.allowed) return fail(check.reason ?? '无法选择该忍者')

  const phase = getPhase(m)
  const side = phase.side as Side
  const action = phase.action as BPActionType

  const next = cloneMatch(m)
  const game = getCurrentGame(next)
  const player = side === 'BLUE' ? game.blue : game.red
  if (action === 'BAN') player.bans.push(ninjaId)
  else player.picks.push(ninjaId)

  next.history.push({
    id: makeId('act'),
    gameNumber: game.gameNumber,
    side,
    action,
    ninjaId,
    timestamp: Date.now(),
    sequenceIndex: phase.totalDone,
  })
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

/** 语义别名：引擎按阶段决定实际动作，两个入口行为一致 */
export const banNinja = selectNinja
export const pickNinja = selectNinja

/** GAME READY → 进入比赛 */
export function enterGame(m: MatchState): EngineResult {
  if (m.status !== 'IN_PROGRESS') return fail('比赛未在进行中')
  const game = getCurrentGame(m)
  if (game.winner) return fail('本局已结束')
  const phase = getPhase(m)
  if (!phase.sequenceComplete) return fail('BP 尚未完成')
  if (game.started) return fail('本局已进入比赛')
  const next = cloneMatch(m)
  getCurrentGame(next).started = true
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

/** 记录本局胜者（比分 +1；满足条件则整场结束） */
export function setGameWinner(m: MatchState, side: Side): EngineResult {
  if (m.status === 'MATCH_FINISHED') return fail('比赛已经结束')
  const game = getCurrentGame(m)
  if (!game.started) return fail('本局尚未进入比赛')
  if (game.winner) return fail('本局已记录胜负')

  const next = cloneMatch(m)
  getCurrentGame(next).winner = side
  if (side === 'BLUE') next.score.blue += 1
  else next.score.red += 1

  const reachedWins = next.score.blue >= next.rule.winsRequired || next.score.red >= next.rule.winsRequired
  const noGamesLeft = next.currentGame >= next.rule.bestOf
  if (reachedWins || noGamesLeft) next.status = 'MATCH_FINISHED'
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

/** 进入下一局（保持 Ban 与已使用忍者） */
export function nextGame(m: MatchState): EngineResult {
  if (m.status === 'MATCH_FINISHED') return fail('比赛已经结束')
  const game = getCurrentGame(m)
  if (!game.winner) return fail('本局尚未记录胜负')
  if (m.currentGame >= m.rule.bestOf) return fail('已经是最后一局')

  const next = cloneMatch(m)
  next.currentGame += 1
  next.games.push(createGameState(next.currentGame))
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

/** 重做本局 BP（尚未记录胜负时可用） */
export function resetCurrentGame(m: MatchState): EngineResult {
  const game = getCurrentGame(m)
  if (game.winner) return fail('本局已记录胜负，请使用撤销')
  const doneCount =
    game.blue.bans.length + game.red.bans.length + game.blue.picks.length + game.red.picks.length
  if (doneCount === 0 && !game.started) return fail('本局还没有任何操作')

  const next = cloneMatch(m)
  const g = getCurrentGame(next)
  g.blue = { bans: [], picks: [] }
  g.red = { bans: [], picks: [] }
  g.started = false
  next.history = next.history.filter((h) => h.gameNumber !== g.gameNumber)
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

/**
 * 撤销最后一步 BP 动作（按 history 日志回退）。
 *
 * 在线模式无法使用客户端快照栈，服务端以 history 为准回退
 * 最近一条 Ban / Pick；若最后事件是胜负/换局，则不做回退（第一版约束，
 * 保证 BP 正确性优先）。本地模式的撤销仍使用完整快照（historyEngine.undo）。
 */
export function undoLastAction(m: MatchState): EngineResult {
  if (m.status === 'MATCH_FINISHED') return fail('比赛已经结束')
  if (m.history.length === 0) return fail('没有可撤销的操作')

  const last = m.history[m.history.length - 1]
  const next = cloneMatch(m)
  const game = getCurrentGame(next)
  if (game.gameNumber !== last.gameNumber) return fail('只能撤销当前小局的操作')
  if (game.winner) return fail('本局已记录胜负，无法直接撤销 BP')

  const player = last.side === 'BLUE' ? game.blue : game.red
  const arr = last.action === 'BAN' ? player.bans : player.picks
  const idx = arr.lastIndexOf(last.ninjaId)
  if (idx === -1) return fail('撤销状态不一致')
  arr.splice(idx, 1)

  next.history = next.history.slice(0, -1)
  next.updatedAt = Date.now()
  return { ok: true, state: next }
}

// ---------------------------------------------------------------------------
// 在线计时器辅助（服务器权威）
// ---------------------------------------------------------------------------

/** 与客户端一致的阶段标识：phaseKey 变化才应重建 deadline */
export function computeTimerPhaseKey(m: MatchState): string {
  const phase = getPhase(m)
  return `${m.id}:G${phase.gameNumber}:${phase.sequenceComplete ? 'DONE' : `S${phase.stepIndex ?? 0}`}`
}

/** 为新状态重建服务器倒计时（phaseKey 变化时调用；seconds 取自规则） */
export function rebuildTimer(m: MatchState, now: number): MatchState {
  if (!m.rule.timerEnabled) return m
  return {
    ...m,
    timer: {
      phaseKey: computeTimerPhaseKey(m),
      deadlineAt: now + m.rule.timerSeconds * 1000,
      timedOut: false,
    },
  }
}

/** 判断两个状态的计时阶段是否不同（撤销/新步骤/换局检测） */
export function timerPhaseChanged(before: MatchState, after: MatchState): boolean {
  return computeTimerPhaseKey(before) !== computeTimerPhaseKey(after)
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

/** 导出比赛完整数据（JSON 下载 / 复盘用） */
export function exportMatchResult(m: MatchState): Record<string, unknown> {
  return {
    ...cloneMatch(m),
    source: 'Ninja BP Arena（忍界 BP · 玩家自制非官方工具）',
    exportedAt: new Date().toISOString(),
  }
}
