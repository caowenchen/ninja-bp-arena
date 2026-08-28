import type { MatchState } from '@/types/match'
import { getPhase } from '@/engine/bpEngine'

interface ScoreBoardProps {
  match: MatchState
}

/** 顶栏比分：蓝方 X : Y 红方 + GAME n */
export function ScoreBoard({ match }: ScoreBoardProps) {
  const phase = getPhase(match)
  const matchOver = match.status === 'MATCH_FINISHED'
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <div className="flex flex-col items-end leading-tight sm:items-center">
        <span className="text-xs font-semibold text-side-blue-soft sm:text-sm">{match.bluePlayerName}</span>
        <span className="text-[9px] tracking-widest text-fog-600">BLUE</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-lg font-bold tabular-nums tracking-wider text-fog-100 sm:text-2xl">
          {match.score.blue}
          <span className="mx-1.5 text-fog-600">:</span>
          {match.score.red}
        </span>
        <span className="text-[9px] tracking-widest text-fog-600">
          {matchOver ? 'MATCH FINISHED' : `GAME ${phase.gameNumber} / BO${match.rule.bestOf}`}
        </span>
      </div>
      <div className="flex flex-col items-start leading-tight sm:items-center">
        <span className="text-xs font-semibold text-side-red-soft sm:text-sm">{match.redPlayerName}</span>
        <span className="text-[9px] tracking-widest text-fog-600">RED</span>
      </div>
    </div>
  )
}
