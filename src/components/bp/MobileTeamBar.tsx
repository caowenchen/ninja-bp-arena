import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { MatchState } from '@/types/match'
import type { Side } from '@/types/bp'
import { useNinjaStore } from '@/store/ninjaStore'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'
import { PlayerPanel } from './PlayerPanel'

interface MobileTeamBarProps {
  match: MatchState
}

/**
 * 移动端阵容条：BLUE 三个小头像 VS RED 三个小头像，
 * 点击展开完整双方阵容（含 Ban）。不再在手机上渲染两个桌面侧栏。
 */
export function MobileTeamBar({ match }: MobileTeamBarProps) {
  const [expanded, setExpanded] = useState(false)
  const ninjaById = useNinjaStore((s) => s.getById)
  const game = match.games[match.games.length - 1]

  const miniSide = (side: Side) => {
    const player = side === 'BLUE' ? game.blue : game.red
    const isBlue = side === 'BLUE'
    return (
      <div className={`flex flex-1 flex-col gap-1 ${isBlue ? 'items-start' : 'items-end'}`}>
        <span className={`text-[9px] font-bold tracking-[0.2em] ${isBlue ? 'text-blue-team-soft' : 'text-red-team-soft'}`}>
          {isBlue ? 'BLUE' : 'RED'}
        </span>
        <div className={`flex gap-1 ${isBlue ? '' : 'flex-row-reverse'}`}>
          {player.picks.map((id) => {
            const ninja = ninjaById(id)
            return (
              <NinjaAvatar
                key={id}
                name={ninja?.name ?? '?'}
                avatar={ninja?.avatar}
                className={`h-8 w-8 rounded ${isBlue ? 'ring-1 ring-blue-team/60' : 'ring-1 ring-red-team/60'}`}
                textClassName="text-xs"
              />
            )
          })}
          {player.picks.length === 0 && <span className="text-[10px] text-fog-600">暂无</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-lg border border-border-muted bg-surface-1/70 px-3 py-2.5"
      >
        {miniSide('BLUE')}
        <span className="text-sm font-black italic text-fog-600">VS</span>
        {miniSide('RED')}
        {expanded ? (
          <ChevronUp size={14} className="shrink-0 text-fog-500" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-fog-500" />
        )}
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <PlayerPanel side="BLUE" />
          <PlayerPanel side="RED" />
        </div>
      )}
    </div>
  )
}
