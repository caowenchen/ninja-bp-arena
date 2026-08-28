import type { MatchState } from '@/types/match'
import { getPhase } from '@/engine/bpEngine'
import { CountdownTimer } from './CountdownTimer'

const SIDE_LABEL = { BLUE: '蓝方', RED: '红方' } as const

/** 序列步骤条：整局 Ban/Pick 流程一览（已完成 / 进行中 / 待执行） */
function SequenceStrip({ match }: { match: MatchState }) {
  const phase = getPhase(match)
  return (
    <div className="flex flex-wrap items-center justify-center gap-1" aria-label="本局 BP 序列">
      {phase.expanded.map((step, index) => {
        const done = index < phase.totalDone
        const current = index === phase.totalDone
        const isBan = step.action === 'BAN'
        return (
          <span
            key={index}
            title={`${SIDE_LABEL[step.side]} ${isBan ? '禁用' : '选择'}`}
            className={`flex h-5 w-7 items-center justify-center rounded text-[9px] font-bold transition-colors ${
              current
                ? isBan
                  ? 'bg-side-red text-white ring-2 ring-side-red/50'
                  : 'bg-side-blue text-white ring-2 ring-side-blue/50'
                : done
                  ? isBan
                    ? 'bg-side-red/25 text-side-red-soft/80'
                    : 'bg-side-blue/25 text-side-blue-soft/80'
                  : 'bg-ink-700 text-fog-600'
            }`}
          >
            {isBan ? '禁' : '选'}
            <span className="ml-0.5 opacity-70">{step.side === 'BLUE' ? '蓝' : '红'}</span>
          </span>
        )
      })}
    </div>
  )
}

interface BPStageProps {
  match: MatchState
  /** 超时遮罩是否激活（激活时暂停倒计时并给出恢复按钮） */
  timeoutActive: boolean
  onResumeTimeout: () => void
  onRestartTimer: () => void
  restartSignal: number
  onTimerExpire: () => void
  className?: string
}

/**
 * 中央舞台：最显眼位置展示当前行动方与剩余数量、倒计时、流程条。
 * READY / PLAYING / 结束态的完整内容在下方全宽区域呈现，这里保持精简状态。
 */
export function BPStage({
  match,
  timeoutActive,
  onResumeTimeout,
  onRestartTimer,
  restartSignal,
  onTimerExpire,
  className = '',
}: BPStageProps) {
  const phase = getPhase(match)
  const rule = match.rule

  const statusText = (() => {
    switch (phase.status) {
      case 'BANNING':
      case 'PICKING': {
        if (timeoutActive) return '操作超时 · 管理员可继续操作'
        const actionText = phase.action === 'BAN' ? '正在禁用' : '正在选择'
        const remain = phase.remainingInStep
        return `${SIDE_LABEL[phase.side!]}${actionText} · ${remain > 0 ? `还需选择 ${remain} 名` : '请选择'}`
      }
      case 'READY':
        return '双方阵容已锁定'
      case 'PLAYING':
        return '本局比赛进行中'
      case 'COMPLETED':
        return '本局已记录胜负'
    }
  })()

  return (
    <section
      className={`flex flex-col items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/70 px-4 py-4 ${className}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-gold/15 px-2 py-0.5 text-xs font-bold tracking-widest text-gold">
          GAME {phase.gameNumber}
        </span>
        <span className="text-xs text-fog-500">
          BO{rule.bestOf} · {rule.name}
        </span>
      </div>

      <p className={`text-center text-base font-semibold lg:text-lg ${timeoutActive ? 'text-side-red' : 'text-fog-100'}`}>
        {statusText}
      </p>

      {(phase.status === 'BANNING' || phase.status === 'PICKING') && (
        <>
          <CountdownTimer
            enabled={rule.timerEnabled && !timeoutActive}
            seconds={rule.timerSeconds}
            resetKey={`${phase.gameNumber}:${phase.stepIndex ?? 'x'}`}
            running={phase.status === 'BANNING' || phase.status === 'PICKING'}
            restartSignal={restartSignal}
            onExpire={onTimerExpire}
          />
          {timeoutActive && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onResumeTimeout}
                className="rounded-lg bg-side-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-side-blue/85"
              >
                继续选择
              </button>
              <button
                type="button"
                onClick={onRestartTimer}
                className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-fog-300 transition-colors hover:bg-ink-600"
              >
                重新计时
              </button>
            </div>
          )}
          <SequenceStrip match={match} />
        </>
      )}
    </section>
  )
}
