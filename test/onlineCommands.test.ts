import { describe, expect, it } from 'vitest'
import { DEFAULT_RULE, cloneRule } from '../src/data/defaultRules'
import { NINJA_POOL } from '../src/data/ninjas'
import {
  applyRoomCommand,
  type RoomCommand,
  type RoomCommandContext,
} from '../supabase/functions/_shared/bp-core/onlineCommands'
import { createMatch, startMatch, getPhase, selectNinja } from '../supabase/functions/_shared/bp-core/bpEngine'
import { validateMatchState } from '../supabase/functions/_shared/bp-core/matchValidator'
import type { MatchState } from '../supabase/functions/_shared/bp-core/types'

/**
 * 在线命令处理器测试（Shared BP Core 纯函数，无需 Supabase）。
 * 覆盖：回合权限 / 观战权限 / 房间状态 / revision CAS / 幂等语义 / 引擎规则。
 */

const NOW = 1_800_000_000_000
const HOST = 'user-host'
const BLUE_ID = 'user-blue'
const RED_ID = 'user-red'

function freshContext(overrides: Partial<RoomCommandContext> = {}): RoomCommandContext {
  // WAITING 房间：一场 SETUP 状态的比赛，蓝方为创建者
  const match = createMatch(cloneRule(DEFAULT_RULE), '蓝方玩家', '红方玩家')
  return {
    match,
    revision: 5,
    roomStatus: 'WAITING',
    expiresAt: NOW + 3600_000,
    mySeat: null,
    isHost: false,
    myUserId: BLUE_ID,
    hostUserId: HOST,
    seatMembers: {
    BLUE: { userId: HOST, displayName: '蓝方玩家' },
    RED: { userId: RED_ID, displayName: '红方玩家' },
  },
    pendingUndo: null,
    ninjas: NINJA_POOL,
    now: NOW,
    ...overrides,
  }
}

function cmd(type: RoomCommand['type'], expectedRevision: number, payload?: RoomCommand['payload']): RoomCommand {
  return { commandId: crypto.randomUUID(), roomId: 'room-1', expectedRevision, type, payload }
}

/** 按顺序执行若干次 select（测试构造用） */
function play(m: MatchState, ids: string[]): MatchState {
  let next = m
  for (const id of ids) {
    const r = selectNinja(next, id, NINJA_POOL.find((n) => n.id === id))
    if (!r.state) throw new Error(`构造失败：${id}（${r.reason}）`)
    next = r.state
  }
  return next
}

/**
 * ACTIVE 比赛中段：完成 4 个 Ban（蓝1 红2 蓝1），
 * 此时阶段 = RED PICK（红方回合）。
 */
function activeContext(overrides: Partial<RoomCommandContext> = {}): { ctx: RoomCommandContext; match: MatchState } {
  const match = play(startMatch(createMatch(cloneRule(DEFAULT_RULE), '蓝方玩家', '红方玩家')), [
    'example-naruto-001',
    'example-sasuke-002',
    'example-kakashi-003',
    'example-itachi-004',
  ])
  const ctx: RoomCommandContext = {
    match,
    revision: 12,
    roomStatus: 'ACTIVE',
    expiresAt: NOW + 3600_000,
    mySeat: 'RED',
    isHost: false,
    myUserId: RED_ID,
    hostUserId: HOST,
    seatMembers: {
    BLUE: { userId: BLUE_ID, displayName: '蓝方玩家' },
    RED: { userId: RED_ID, displayName: '红方玩家' },
  },
    pendingUndo: null,
    ninjas: NINJA_POOL,
    now: NOW,
    ...overrides,
  }
  return { ctx, match }
}

/** Game1 BP 全部完成（READY）的上下文 */
function completedGameContext(overrides: Partial<RoomCommandContext> = {}): { ctx: RoomCommandContext; match: MatchState } {
  const match = play(startMatch(createMatch(cloneRule(DEFAULT_RULE), '蓝方玩家', '红方玩家')), [
    'example-naruto-001',
    'example-sasuke-002',
    'example-kakashi-003',
    'example-itachi-004',
    'example-gaara-012',
    'example-tsunade-010',
    'example-orochimaru-011',
    'example-deidara-015',
    'example-sasori-016',
    'example-jiraiya-009',
  ])
  const ctx: RoomCommandContext = {
    match,
    revision: 12,
    roomStatus: 'ACTIVE',
    expiresAt: NOW + 3600_000,
    mySeat: 'BLUE',
    isHost: false,
    myUserId: BLUE_ID,
    hostUserId: HOST,
    seatMembers: {
    BLUE: { userId: BLUE_ID, displayName: '蓝方玩家' },
    RED: { userId: RED_ID, displayName: '红方玩家' },
  },
    pendingUndo: null,
    ninjas: NINJA_POOL,
    now: NOW,
    ...overrides,
  }
  return { ctx, match }
}

describe('在线命令：回合与权限', () => {
  it('RED 在 RED 回合 SELECT_NINJA 成功，revision +1，状态合法', () => {
    const { ctx } = activeContext()
    expect(getPhase(ctx.match).side).toBe('RED')
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out.status).toBe('APPLIED')
    if (out.status !== 'APPLIED') return
    expect(out.revision).toBe(13)
    expect(out.match.games[0].red.picks).toContain('example-gaara-012')
    expect(validateMatchState(out.match)).toBe(true)
  })

  it('BLUE 在 RED 回合操作被拒绝 NOT_YOUR_TURN，状态不变', () => {
    const { ctx } = activeContext({ mySeat: 'BLUE', myUserId: BLUE_ID })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NOT_YOUR_TURN' })
  })

  it('Observer 操作被拒绝 NOT_PERMITTED（即使伪造 payload.side 也不生效）', () => {
    const { ctx } = activeContext({ mySeat: 'OBSERVER' })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012', side: 'RED' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NOT_PERMITTED' })
  })

  it('SELECT_NINJA 不可信客户端 side：BLUE 传 side=RED 仍按阶段判定拒绝', () => {
    const { ctx } = activeContext({ mySeat: 'BLUE', myUserId: BLUE_ID })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012', side: 'RED' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NOT_YOUR_TURN' })
  })
})

describe('在线命令：被 Ban / USED / 结束后', () => {
  it('选择已被 Ban 的忍者被拒绝', () => {
    const { ctx } = activeContext()
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-naruto-001' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NINJA_BLOCKED' })
    expect(out.status === 'REJECTED' && out.message).toContain('禁用')
  })

  it('Game1 出场忍者进入 Game2 后为 USED 被拒绝', () => {
    const { ctx } = completedGameContext()
    const enter = applyRoomCommand(ctx, cmd('ENTER_GAME', 12))
    if (enter.status !== 'APPLIED') throw new Error('enter failed')
    const winner = applyRoomCommand(
      { ...ctx, isHost: true, myUserId: HOST, match: enter.match, revision: enter.revision },
      cmd('SET_GAME_WINNER', enter.revision, { side: 'BLUE' }),
    )
    if (winner.status !== 'APPLIED') throw new Error('winner failed')
    const next = applyRoomCommand(
      { ...ctx, isHost: true, myUserId: HOST, match: winner.match, revision: winner.revision },
      cmd('NEXT_GAME', winner.revision),
    )
    if (next.status !== 'APPLIED') throw new Error('next failed')

    // Game2 第一回合是红方：尝试选择 Game1 出场过的自来也（USED）
    const ctxGame2: RoomCommandContext = { ...ctx, mySeat: 'RED', myUserId: RED_ID, match: next.match, revision: next.revision }
    expect(getPhase(next.match).side).toBe('RED')
    const out = applyRoomCommand(ctxGame2, cmd('SELECT_NINJA', next.revision, { ninjaId: 'example-jiraiya-009' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NINJA_BLOCKED' })
    expect(out.status === 'REJECTED' && out.message).toContain('出战')
  })

  it('MATCH_FINISHED 后一切 BP 操作被拒绝', () => {
    const { ctx, match } = activeContext({ isHost: true })
    const finished: MatchState = {
      ...structuredClone(match),
      status: 'MATCH_FINISHED',
      score: { blue: 2, red: 0 },
    }
    const out = applyRoomCommand({ ...ctx, match: finished }, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'MATCH_FINISHED' })
  })
})

describe('在线命令：房间状态', () => {
  it('过期房间拒绝', () => {
    const { ctx } = activeContext({ expiresAt: NOW - 1000 })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'ROOM_EXPIRED' })
  })

  it('已关闭房间拒绝', () => {
    const { ctx } = activeContext({ roomStatus: 'CLOSED' })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'ROOM_CLOSED' })
  })

  it('START_MATCH：房主 + 双方就座 → ACTIVE；非房主拒绝；缺一方拒绝', () => {
    const waiting = freshContext({ isHost: true, mySeat: 'BLUE', myUserId: HOST })
    const out = applyRoomCommand(waiting, cmd('START_MATCH', 5))
    expect(out.status).toBe('APPLIED')
    if (out.status === 'APPLIED') {
      expect(out.roomStatus).toBe('ACTIVE')
      expect(out.match.status).toBe('IN_PROGRESS')
    }

    const notHost = freshContext({ isHost: false, mySeat: 'BLUE' })
    expect(applyRoomCommand(notHost, cmd('START_MATCH', 5))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })

    const missingRed = freshContext({
      isHost: true,
      mySeat: 'BLUE',
      myUserId: HOST,
      seatMembers: { BLUE: { userId: HOST, displayName: '蓝方玩家' }, RED: null },
    })
    expect(applyRoomCommand(missingRed, cmd('START_MATCH', 5))).toMatchObject({ status: 'REJECTED', code: 'SEAT_NOT_READY' })
  })

  it('START_MATCH：服务端用 room_members.display_name 填充双方名称', () => {
    const waiting = freshContext({
      isHost: true,
      mySeat: 'BLUE',
      myUserId: HOST,
      match: { ...createMatch(cloneRule(DEFAULT_RULE), '蓝方玩家', '红方玩家') },
      seatMembers: {
        BLUE: { userId: HOST, displayName: '张三' },
        RED: { userId: RED_ID, displayName: '李四' },
      },
    })
    const out = applyRoomCommand(waiting, cmd('START_MATCH', 5))
    expect(out.status).toBe('APPLIED')
    if (out.status !== 'APPLIED') return
    expect(out.match.bluePlayerName).toBe('张三')
    expect(out.match.redPlayerName).toBe('李四')
  })

  it('START_MATCH：Observer 被拒绝', () => {
    const waiting = freshContext({ isHost: false, mySeat: 'OBSERVER' })
    expect(applyRoomCommand(waiting, cmd('START_MATCH', 5))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })
  })

  it('ENTER_GAME 任一席位玩家可用且幂等；胜负/下一局/重置仅房主', () => {
    const { ctx } = completedGameContext()
    const enter = applyRoomCommand(ctx, cmd('ENTER_GAME', 12))
    expect(enter.status).toBe('APPLIED')
    if (enter.status !== 'APPLIED') return
    // 第二个玩家同时点击 → 幂等成功，状态不变
    const enterAgain = applyRoomCommand(
      { ...ctx, mySeat: 'RED', myUserId: RED_ID, match: enter.match, revision: enter.revision },
      cmd('ENTER_GAME', 13),
    )
    expect(enterAgain.status).toBe('APPLIED')
    if (enterAgain.status !== 'APPLIED') return
    expect(enterAgain.match).toEqual(enter.match)

    const ctxAfter: RoomCommandContext = { ...ctx, match: enter.match, revision: enter.revision }
    expect(applyRoomCommand(ctxAfter, cmd('SET_GAME_WINNER', 13, { side: 'BLUE' }))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })
    expect(applyRoomCommand(ctxAfter, cmd('NEXT_GAME', 13))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })
    expect(applyRoomCommand(ctxAfter, cmd('RESET_MATCH', 13))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })

    const hostCtx: RoomCommandContext = { ...ctxAfter, isHost: true, myUserId: HOST }
    const winner = applyRoomCommand(hostCtx, cmd('SET_GAME_WINNER', 13, { side: 'BLUE' }))
    expect(winner.status).toBe('APPLIED')
    if (winner.status !== 'APPLIED') return
    expect(winner.match.score).toEqual({ blue: 1, red: 0 })
    expect(applyRoomCommand({ ...hostCtx, match: winner.match, revision: winner.revision }, cmd('NEXT_GAME', 14)).status).toBe('APPLIED')
  })
})

describe('在线命令：Revision 与幂等', () => {
  it('expectedRevision 不匹配 → REVISION_CONFLICT', () => {
    const { ctx } = activeContext()
    expect(applyRoomCommand(ctx, cmd('SELECT_NINJA', 11, { ninjaId: 'example-gaara-012' }))).toMatchObject({
      status: 'REJECTED',
      code: 'REVISION_CONFLICT',
    })
    expect(applyRoomCommand(ctx, cmd('SELECT_NINJA', 13, { ninjaId: 'example-gaara-012' }))).toMatchObject({
      status: 'REJECTED',
      code: 'REVISION_CONFLICT',
    })
  })

  it('两个并发请求带相同 expectedRevision：只有一个匹配，另一个被拒（CAS 语义）', () => {
    const { ctx } = activeContext()
    const a = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(a.status).toBe('APPLIED')
    // 第二个请求仍带旧 expectedRevision=12，而数据库 revision 已被第一次推进到 13 → CAS 拒绝
    const b = applyRoomCommand(
      { ...ctx, match: (a as { match: MatchState }).match, revision: 13 },
      cmd('SELECT_NINJA', 12, { ninjaId: 'example-tsunade-010' }),
    )
    expect(b).toMatchObject({ status: 'REJECTED', code: 'REVISION_CONFLICT' })
  })
})

describe('在线命令：撤销请求流程', () => {
  it('REQUEST_UNDO 生成 pendingUndo；CONFIRM_UNDO 由对方执行回退；请求者不能自确认', () => {
    const { ctx } = activeContext({ mySeat: 'RED', myUserId: RED_ID })
    const req = applyRoomCommand(ctx, cmd('REQUEST_UNDO', 12))
    expect(req.status).toBe('APPLIED')
    if (req.status !== 'APPLIED') return
    expect(req.pendingUndo).toMatchObject({ requestedBy: 'RED', pendingAtRevision: 13 })
    expect(req.revision).toBe(13)
    expect(req.match.history).toHaveLength(4)

    // 请求者自己确认（即使同时是房主）→ 必须拒绝
    const self = applyRoomCommand(
      { ...ctx, isHost: true, myUserId: RED_ID, pendingUndo: req.pendingUndo, revision: 13 },
      cmd('CONFIRM_UNDO', 13),
    )
    expect(self).toMatchObject({ status: 'REJECTED', code: 'UNDO_NOT_REQUESTER' })

    // 对方（BLUE）确认 → 撤销最后一步（蓝方 Ban 鼬）
    const confirm = applyRoomCommand(
      { ...ctx, mySeat: 'BLUE', myUserId: BLUE_ID, pendingUndo: req.pendingUndo, revision: 13 },
      cmd('CONFIRM_UNDO', 13),
    )
    expect(confirm.status).toBe('APPLIED')
    if (confirm.status !== 'APPLIED') return
    expect(confirm.match.history).toHaveLength(3)
    expect(confirm.match.games[0].blue.bans).not.toContain('example-itachi-004')
  })

  it('REJECT_UNDO 清除请求；目标 revision 过期后 CONFIRM 拒绝', () => {
    const { ctx } = activeContext({ mySeat: 'RED' })
    const req = applyRoomCommand(ctx, cmd('REQUEST_UNDO', 12))
    if (req.status !== 'APPLIED') throw new Error('request failed')
    const pending = req.pendingUndo

    const rej = applyRoomCommand(
      { ...ctx, mySeat: 'BLUE', myUserId: BLUE_ID, pendingUndo: pending, revision: 13 },
      cmd('REJECT_UNDO', 13),
    )
    expect(rej.status).toBe('APPLIED')
    if (rej.status !== 'APPLIED') return
    expect(rej.pendingUndo).toBeNull()
    expect(rej.match.history).toHaveLength(4)

    // 状态已前进（revision 13），挂起的撤销请求（target 12）自动失效
    // 请求应用后发生了其他比赛命令（revision 前进到 14）→ 请求自动失效
    const expired = applyRoomCommand(
      { ...ctx, mySeat: 'BLUE', myUserId: BLUE_ID, revision: 14, pendingUndo: pending },
      cmd('CONFIRM_UNDO', 14),
    )
    expect(expired).toMatchObject({ status: 'REJECTED', code: 'UNDO_EXPIRED' })
  })

  it('历史为空时 REQUEST_UNDO 拒绝', () => {
    const { ctx } = activeContext({ mySeat: 'RED' })
    const empty = { ...ctx, match: startMatch(ctx.match) }
    expect(applyRoomCommand(empty, cmd('REQUEST_UNDO', 12))).toMatchObject({ status: 'REJECTED', code: 'NOTHING_TO_UNDO' })
  })
})

describe('在线命令：撤销请求自动失效', () => {
  it('REQUEST_UNDO 后发生其他比赛命令 → pendingUndo 被清除', () => {
    const { ctx } = activeContext({ mySeat: 'RED' })
    const req = applyRoomCommand(ctx, cmd('REQUEST_UNDO', 12))
    if (req.status !== 'APPLIED') throw new Error('request failed')
    expect(req.pendingUndo).not.toBeNull()

    // 行动方（红方自己）在请求后继续选择 → 其他比赛命令使请求失效
    const next = applyRoomCommand(
      { ...ctx, match: req.match, revision: req.revision, pendingUndo: req.pendingUndo },
      cmd('SELECT_NINJA', req.revision, { ninjaId: 'example-gaara-012' }),
    )
    if (next.status !== 'APPLIED') throw new Error('select failed')
    expect(next.pendingUndo).toBeNull()
  })
})

describe('在线命令：RESTART_TIMER 与服务器计时器', () => {
  it('阶段推进时服务器生成 deadlineAt（客户端不传 deadline）', () => {
    const { ctx } = activeContext()
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    if (out.status !== 'APPLIED') throw new Error('select failed')
    expect(out.match.timer).toBeDefined()
    expect(out.match.timer!.phaseKey).toContain(':S')
    expect(out.match.timer!.deadlineAt).toBeGreaterThanOrEqual(NOW)
  })

  it('RESTART_TIMER：当前行动方或房主可用；阶段不变时 deadline 重建', () => {
    const { ctx } = activeContext()
    const act = applyRoomCommand(ctx, cmd('RESTART_TIMER', 12))
    if (act.status !== 'APPLIED') throw new Error('restart failed')
    expect(act.match.timer?.deadlineAt).toBeGreaterThanOrEqual(NOW)

    const observer = applyRoomCommand({ ...ctx, mySeat: 'OBSERVER' }, cmd('RESTART_TIMER', 12))
    expect(observer).toMatchObject({ status: 'REJECTED', code: 'NOT_PERMITTED' })

    // 非行动方玩家（BLUE）也不能
    const other = applyRoomCommand({ ...ctx, mySeat: 'BLUE', myUserId: BLUE_ID }, cmd('RESTART_TIMER', 12))
    expect(other).toMatchObject({ status: 'REJECTED', code: 'NOT_PERMITTED' })
  })
})

describe('在线命令：CLOSE_ROOM', () => {
  it('房主可关闭房间（状态 → CLOSED）；其他玩家与观战者被拒', () => {
    const { ctx } = activeContext({ isHost: true, mySeat: 'BLUE', myUserId: HOST })
    const out = applyRoomCommand(ctx, cmd('CLOSE_ROOM', 12))
    expect(out.status).toBe('APPLIED')
    if (out.status !== 'APPLIED') return
    expect(out.roomStatus).toBe('CLOSED')

    const notHost = activeContext({ isHost: false, mySeat: 'RED' }).ctx
    expect(applyRoomCommand(notHost, cmd('CLOSE_ROOM', 12))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })

    const observer = activeContext({ isHost: false, mySeat: 'OBSERVER' }).ctx
    expect(applyRoomCommand(observer, cmd('CLOSE_ROOM', 12))).toMatchObject({ status: 'REJECTED', code: 'NOT_HOST' })
  })
})

describe('在线命令：席位与身份', () => {
  it('未加入房间的用户被拒绝 NOT_MEMBER', () => {
    const { ctx } = activeContext({ mySeat: null })
    const out = applyRoomCommand(ctx, cmd('SELECT_NINJA', 12, { ninjaId: 'example-gaara-012' }))
    expect(out).toMatchObject({ status: 'REJECTED', code: 'NOT_MEMBER' })
  })
})
