import type { ReactNode } from 'react'
import { computeTimerPhaseKey, getPhase } from '@bp-core'
import { useOnlineRoomStore } from '@/online/onlineRoomStore'
import { MatchSourceProvider, type MatchSource } from './context'

/**
 * 在线模式 MatchSource：一切操作转为语义命令，由服务端（Shared BP Core）
 * 验证并应用；本组件不产生任何本地状态修改。操作为异步（等待服务端确认）。
 */
export function OnlineMatchSource({ children }: { children: ReactNode }) {
  const match = useOnlineRoomStore((s) => s.match)
  const mySeat = useOnlineRoomStore((s) => s.mySeat)
  const isHost = useOnlineRoomStore((s) => s.isHost)
  const userId = useOnlineRoomStore((s) => s.userId)
  const connection = useOnlineRoomStore((s) => s.connection)
  const pendingCommand = useOnlineRoomStore((s) => s.pendingCommand)
  const pendingUndo = useOnlineRoomStore((s) => s.pendingUndo)
  const roomStatus = useOnlineRoomStore((s) => s.roomStatus)
  const onlineNinjaIds = useOnlineRoomStore((s) => s.onlineNinjaIds)

  const phase = match ? getPhase(match) : null
  const isMyTurn = Boolean(
    match &&
      roomStatus === 'ACTIVE' &&
      match.status === 'IN_PROGRESS' &&
      (mySeat === 'BLUE' || mySeat === 'RED') &&
      phase?.side === mySeat &&
      !phase.sequenceComplete,
  )
  const canOperate = isMyTurn && connection !== 'offline' && !pendingCommand
  const onlineDeadline =
    match?.timer && match.timer.phaseKey === computeTimerPhaseKey(match) ? match.timer.deadlineAt : null

  const source: MatchSource = {
    mode: 'online',
    match,
    selectNinja: (ninjaId) => useOnlineRoomStore.getState().sendCommand('SELECT_NINJA', { ninjaId }),
    undo: () => useOnlineRoomStore.getState().sendCommand('REQUEST_UNDO'),
    redo: () => ({ ok: false, reason: '在线模式暂不支持重做' }),
    canUndo: Boolean(match && match.history.length > 0 && roomStatus === 'ACTIVE'),
    canRedo: false,
    enterGame: () => useOnlineRoomStore.getState().sendCommand('ENTER_GAME'),
    setGameWinner: (side) => useOnlineRoomStore.getState().sendCommand('SET_GAME_WINNER', { side }),
    nextGame: () => useOnlineRoomStore.getState().sendCommand('NEXT_GAME'),
    resetMatch: () => void useOnlineRoomStore.getState().sendCommand('RESET_MATCH'),
    restartTimer: () => void useOnlineRoomStore.getState().sendCommand('RESTART_TIMER'),
    mySeat,
    isHost,
    isMyTurn,
    canOperate,
    pendingCommand,
    onlineDeadline,
    connection,
    pendingUndo,
    myUserId: userId,
    onlineNinjaIds,
    resync: () => useOnlineRoomStore.getState().refreshSnapshot(),
  }

  return <MatchSourceProvider value={source}>{children}</MatchSourceProvider>
}
