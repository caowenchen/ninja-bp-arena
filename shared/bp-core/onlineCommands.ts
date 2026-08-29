import type { MatchState, Side } from './types'
import {
  canSelectNinja,
  enterGame,
  nextGame,
  resetCurrentGame,
  selectNinja,
  setGameWinner,
  startMatch,
  undoLastAction,
  rebuildTimer,
  timerPhaseChanged,
  getPhase,
  computeTimerPhaseKey,
} from './bpEngine'
import type { Ninja } from './types'

/**
 * 在线房间命令处理器（Shared BP Core 的纯函数部分）。
 *
 * 客户端永远不是权威状态源：客户端只发送“我想做什么”，
 * 由 Edge Function 调用本模块在服务端验证并执行，数据库保存结果。
 * 本模块不接触网络 / 数据库，因此可以完全离线地做单元测试。
 *
 * 关键规则：
 * - Side 一律由 getPhase(match) 推导，绝不信任客户端传来的 side
 * - 所有 applied 命令 revision + 1（由调用方做 CAS 更新）
 * - commandId 幂等由调用方（room_commands 表）保证
 */

export type OnlineCommandType =
  | 'START_MATCH'
  | 'SELECT_NINJA'
  | 'ENTER_GAME'
  | 'SET_GAME_WINNER'
  | 'NEXT_GAME'
  | 'REQUEST_UNDO'
  | 'CONFIRM_UNDO'
  | 'REJECT_UNDO'
  | 'RESTART_TIMER'
  | 'RESET_MATCH'
  | 'CLOSE_ROOM'

export type Seat = 'BLUE' | 'RED' | 'OBSERVER'

export type RoomStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'CLOSED'

/** 挂起的撤销请求（存 rooms.pending_action；revision 变化后自动失效由 targetRevision 保证） */
export interface PendingUndo {
  type: 'UNDO'
  requestedBy: Seat
  requestedByUserId: string
  targetRevision: number
  createdAt: number
}

export interface RoomCommandContext {
  /** 数据库中的权威状态 */
  match: MatchState
  revision: number
  roomStatus: RoomStatus
  /** ISO 或毫秒时间戳均可，处理前统一为 ms */
  expiresAt: number
  /** 当前用户席位（由 room_members 推导，不来自请求体） */
  mySeat: Seat | null
  isHost: boolean
  myUserId: string
  hostUserId: string
  /** 席位占用情况（START_MATCH 需要双方就座） */
  seatUserIds: { BLUE: string | null; RED: string | null }
  pendingUndo: PendingUndo | null
  /** 忍者池（SELECT_NINJA 校验忍者存在与 enabled） */
  ninjas: Ninja[]
  now: number
}

export interface RoomCommand {
  commandId: string
  roomId: string
  expectedRevision: number
  type: OnlineCommandType
  payload?: { ninjaId?: string; side?: Side }
}

export type CommandOutcome =
  | {
      status: 'APPLIED'
      /** 新的权威状态（未变化时与输入相同） */
      match: MatchState
      /** 新 revision（APPLIED 一律 +1） */
      revision: number
      roomStatus: RoomStatus
      pendingUndo: PendingUndo | null
    }
  | { status: 'REJECTED'; code: RejectCode; message: string }

export type RejectCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_MEMBER'
  | 'NOT_HOST'
  | 'NOT_YOUR_TURN'
  | 'NOT_PERMITTED'
  | 'ROOM_EXPIRED'
  | 'ROOM_CLOSED'
  | 'ROOM_NOT_WAITING'
  | 'ROOM_NOT_ACTIVE'
  | 'SEAT_NOT_READY'
  | 'REVISION_CONFLICT'
  | 'INVALID_COMMAND'
  | 'NINJA_BLOCKED'
  | 'MATCH_FINISHED'
  | 'NOTHING_TO_UNDO'
  | 'NO_PENDING_UNDO'
  | 'UNDO_NOT_REQUESTER'
  | 'ENGINE_REJECTED'
  | 'ROOM_NOT_FOUND'

function reject(code: RejectCode, message: string): CommandOutcome {
  return { status: 'REJECTED', code, message }
}

function isSeatPlayer(seat: Seat | null): seat is 'BLUE' | 'RED' {
  return seat === 'BLUE' || seat === 'RED'
}

/** 命令是否需要执行引擎（决定是否重建计时器） */
function applyOneCommand(ctx: RoomCommandContext, cmd: RoomCommand): { match: MatchState; extra?: string } | CommandOutcome {
  const { match } = ctx

  switch (cmd.type) {
    case 'START_MATCH': {
      if (!ctx.isHost) return reject('NOT_HOST', '只有房主可以开始比赛')
      if (ctx.roomStatus !== 'WAITING') return reject('ROOM_NOT_WAITING', '房间已经开始或已结束')
      if (!ctx.seatUserIds.BLUE || !ctx.seatUserIds.RED) return reject('SEAT_NOT_READY', '需要蓝红双方都就座后才能开始')
      if (match.status !== 'SETUP') return reject('ROOM_NOT_WAITING', '比赛状态异常')
      const blueName = ctx.match.bluePlayerName
      const redName = ctx.match.redPlayerName
      const next = startMatch({ ...match, bluePlayerName: blueName, redPlayerName: redName })
      return { match: next, extra: 'ACTIVE' }
    }

    case 'SELECT_NINJA': {
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      if (!isSeatPlayer(ctx.mySeat)) return reject('NOT_PERMITTED', '观战者不能操作 BP')
      if (match.status === 'MATCH_FINISHED') return reject('MATCH_FINISHED', '比赛已经结束')

      const ninjaId = cmd.payload?.ninjaId
      if (typeof ninjaId !== 'string' || !ninjaId) return reject('INVALID_COMMAND', '缺少忍者 ID')

      // Side 由引擎阶段推导，不信任客户端
      const phase = getPhase(match)
      if (!phase.side || phase.sequenceComplete) return reject('NOT_YOUR_TURN', '当前不是选择阶段')
      if (phase.side !== ctx.mySeat) return reject('NOT_YOUR_TURN', '还没有轮到你操作')

      const ninja = ctx.ninjas.find((n) => n.id === ninjaId)
      const check = canSelectNinja(match, ninjaId, ninja)
      if (!check.allowed) return reject('NINJA_BLOCKED', check.reason ?? '无法选择该忍者')

      const result = selectNinja(match, ninjaId, ninja)
      if (!result.ok || !result.state) return reject('ENGINE_REJECTED', result.reason ?? '无法选择该忍者')
      return { match: result.state }
    }

    case 'ENTER_GAME': {
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      if (!isSeatPlayer(ctx.mySeat) && !ctx.isHost) return reject('NOT_PERMITTED', '观战者不能操作')
      const result = enterGame(match)
      if (!result.ok) {
        // 双方同时点击“进入比赛”时，第二次视为幂等成功
        if (result.reason === '本局已进入比赛') return { match }
        return reject('ENGINE_REJECTED', result.reason ?? '无法进入比赛')
      }
      return { match: result.state! }
    }

    case 'SET_GAME_WINNER': {
      if (!ctx.isHost) return reject('NOT_HOST', '只有房主可以记录胜负')
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      const side = cmd.payload?.side
      if (side !== 'BLUE' && side !== 'RED') return reject('INVALID_COMMAND', '缺少胜者阵营')
      const result = setGameWinner(match, side)
      if (!result.ok || !result.state) return reject('ENGINE_REJECTED', result.reason ?? '无法记录胜负')
      return { match: result.state, extra: result.state.status === 'MATCH_FINISHED' ? 'FINISHED' : undefined }
    }

    case 'NEXT_GAME': {
      if (!ctx.isHost) return reject('NOT_HOST', '只有房主可以进入下一局')
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      const result = nextGame(match)
      if (!result.ok || !result.state) return reject('ENGINE_REJECTED', result.reason ?? '无法进入下一局')
      return { match: result.state }
    }

    case 'RESET_MATCH': {
      if (!ctx.isHost) return reject('NOT_HOST', '只有房主可以重置比赛')
      if (ctx.roomStatus !== 'ACTIVE' && ctx.roomStatus !== 'FINISHED') {
        return reject('ROOM_NOT_ACTIVE', '当前状态不能重置')
      }
      const result = resetCurrentGame(match)
      if (!result.ok || !result.state) {
        // 已记录胜负 / 已结束的整场重置：回到全新 WAITING 场次由 host 重新开始
        const fresh = startMatch({ ...match, status: 'SETUP' })
        return { match: fresh, extra: 'WAITING' }
      }
      return { match: result.state }
    }

    case 'REQUEST_UNDO': {
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      if (!isSeatPlayer(ctx.mySeat)) return reject('NOT_PERMITTED', '观战者不能请求撤销')
      if (match.status === 'MATCH_FINISHED') return reject('MATCH_FINISHED', '比赛已经结束')
      if (match.history.length === 0) return reject('NOTHING_TO_UNDO', '没有可撤销的操作')
      return { match }
    }

    case 'CONFIRM_UNDO': {
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      const pending = ctx.pendingUndo
      if (!pending) return reject('NO_PENDING_UNDO', '当前没有撤销请求')
      // 请求者自己不能确认；对方或房主可以确认
      const isOtherPlayer = isSeatPlayer(ctx.mySeat) && ctx.mySeat !== pending.requestedBy
      if (!isOtherPlayer && !ctx.isHost) return reject('UNDO_NOT_REQUESTER', '等待对方处理撤销请求')
      // 目标 revision 已变化则请求自动失效
      if (pending.targetRevision !== ctx.revision) return reject('NO_PENDING_UNDO', '撤销请求已过期')
      const result = undoLastAction(ctx.match)
      if (!result.ok || !result.state) return reject('NOTHING_TO_UNDO', result.reason ?? '没有可撤销的操作')
      return { match: result.state }
    }

    case 'REJECT_UNDO': {
      const pending = ctx.pendingUndo
      if (!pending) return reject('NO_PENDING_UNDO', '当前没有撤销请求')
      const involved = isSeatPlayer(ctx.mySeat) || ctx.isHost
      if (!involved) return reject('NOT_PERMITTED', '观战者不能处理撤销请求')
      return { match: ctx.match }
    }

    case 'RESTART_TIMER': {
      if (ctx.roomStatus !== 'ACTIVE') return reject('ROOM_NOT_ACTIVE', '比赛未在进行中')
      const phase = getPhase(match)
      const isActingSide = isSeatPlayer(ctx.mySeat) && phase.side === ctx.mySeat && !phase.sequenceComplete
      if (!isActingSide && !ctx.isHost) return reject('NOT_PERMITTED', '只有当前行动方或房主可以重新计时')
      if (!match.rule.timerEnabled) return reject('INVALID_COMMAND', '本房间未启用倒计时')
      return { match }
    }

    case 'CLOSE_ROOM': {
      // Host 关闭房间：任何状态都可以关闭（需二次确认在客户端完成）
      if (!ctx.isHost) return reject('NOT_HOST', '只有房主可以关闭房间')
      return { match }
    }

    default:
      return reject('INVALID_COMMAND', '未知命令')
  }
}

/**
 * 执行一条房间命令。
 * 返回 APPLIED 时，调用方必须以 CAS（WHERE revision = ctx.revision）方式
 * 将新状态写回数据库并把 revision + 1。
 */
export function applyRoomCommand(ctx: RoomCommandContext, cmd: RoomCommand): CommandOutcome {
  // 基础校验：时间
  const expiresAtMs = ctx.expiresAt > 1e12 ? ctx.expiresAt : ctx.expiresAt * 1000
  if (ctx.now >= expiresAtMs) return reject('ROOM_EXPIRED', '房间已过期')
  if (ctx.roomStatus === 'CLOSED') return reject('ROOM_CLOSED', '房间已关闭')
  if (!ctx.mySeat && !ctx.isHost) return reject('NOT_MEMBER', '你还没有加入这个房间')
  if (!Number.isInteger(cmd.expectedRevision) || cmd.expectedRevision < 0) {
    return reject('INVALID_COMMAND', 'revision 非法')
  }
  // CAS：客户端状态过期
  if (cmd.expectedRevision !== ctx.revision) return reject('REVISION_CONFLICT', '比赛状态已更新，请重新同步')

  const result = applyOneCommand(ctx, cmd)
  if ('status' in result) return result

  let nextMatch = result.match
  let nextStatus: RoomStatus = ctx.roomStatus
  if (result.extra === 'ACTIVE') nextStatus = 'ACTIVE'
  if (result.extra === 'FINISHED') nextStatus = 'FINISHED'
  if (result.extra === 'WAITING') nextStatus = 'WAITING'

  // 计时器：只有服务器有权生成 deadline。
  // 阶段变化（新步骤/换局/开始）→ 以服务器时间重建；RESTART_TIMER → 立即重建。
  if (nextMatch.rule.timerEnabled && nextMatch.status === 'IN_PROGRESS') {
    const shouldRebuild =
      cmd.type === 'RESTART_TIMER' ||
      (nextMatch.status === 'IN_PROGRESS' &&
        (ctx.match.status !== 'IN_PROGRESS' || timerPhaseChanged(ctx.match, nextMatch)))
    if (shouldRebuild && computeTimerPhaseKey(nextMatch)) {
      nextMatch = rebuildTimer(nextMatch, ctx.now)
    }
  }

  // 撤销请求的生命周期
  let pendingUndo: PendingUndo | null = ctx.pendingUndo
  if (cmd.type === 'REQUEST_UNDO') {
    pendingUndo = {
      type: 'UNDO',
      requestedBy: ctx.mySeat as 'BLUE' | 'RED',
      requestedByUserId: ctx.myUserId,
      targetRevision: ctx.revision,
      createdAt: ctx.now,
    }
  } else if (cmd.type === 'CONFIRM_UNDO' || cmd.type === 'REJECT_UNDO') {
    pendingUndo = null
  } else if (pendingUndo && cmd.expectedRevision !== pendingUndo.targetRevision) {
    // 状态已前进，挂起的撤销请求自动失效
    pendingUndo = null
  }

  // 撤销请求类命令不改变 match_state 内容（仍 +1 revision 以广播）
  return {
    status: 'APPLIED',
    match: nextMatch,
    revision: ctx.revision + 1,
    roomStatus: nextStatus,
    pendingUndo,
  }
}
