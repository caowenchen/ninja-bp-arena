import type { ReactNode } from 'react'
import type { Side } from '@bp-core'
import { useBPStore } from '@/store/bpStore'
import { useTimerStore } from '@/store/timerStore'
import { getPhase } from '@bp-core'
import { MatchSourceProvider, type MatchSource } from './context'

/**
 * 本地模式 MatchSource：单机 BP 一切行为与 v0.2.0 一致
 * （bpStore 快照撤销 + timerStore 本地计时），完全离线可用。
 */
export function LocalMatchSource({ children }: { children: ReactNode }) {
  const match = useBPStore((s) => s.match)
  const canUndo = useBPStore((s) => s.stacks.past.length > 0)
  const canRedo = useBPStore((s) => s.stacks.future.length > 0)

  const source: MatchSource = {
    mode: 'local',
    match,
    selectNinja: (ninjaId) => useBPStore.getState().selectNinja(ninjaId),
    undo: () => ({ ok: useBPStore.getState().undo() }),
    redo: () => ({ ok: useBPStore.getState().redo() }),
    canUndo,
    canRedo,
    enterGame: () => useBPStore.getState().enterGame(),
    setGameWinner: (side: Side) => useBPStore.getState().setGameWinner(side),
    nextGame: () => useBPStore.getState().nextGame(),
    resetMatch: () => useBPStore.getState().resetMatch(),
    restartTimer: () => {
      const m = useBPStore.getState().match
      if (m) useTimerStore.getState().restart(m.rule.timerSeconds)
    },
    isMyTurn: true,
    canOperate: true,
    onlineDeadline: null,
  }

  return <MatchSourceProvider value={source}>{children}</MatchSourceProvider>
}

/** 本地计时器同步：phaseKey 变化才重建 deadline（供 BPWorkspace 使用） */
export function syncLocalTimer(match: NonNullable<MatchSource['match']>, inBP: boolean) {
  const phase = getPhase(match)
  const phaseKey = `${match.id}:G${phase.gameNumber}:${phase.sequenceComplete ? 'DONE' : `S${phase.stepIndex ?? 0}`}`
  useTimerStore.getState().sync({
    phaseKey,
    seconds: match.rule.timerSeconds,
    enabled: match.rule.timerEnabled && inBP,
  })
}
