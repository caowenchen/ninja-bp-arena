import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import type { Side } from '@/types/bp'
import { useBPStore } from '@/store/bpStore'
import { getPhase } from '@/engine/bpEngine'
import { useNinjaStore } from '@/store/ninjaStore'
import { BanSlot } from './BanSlot'
import { PickSlot } from './PickSlot'

interface PlayerPanelProps {
  side: Side
}

/**
 * 玩家区域：Ban / Pick 槽位全部由当前局的规则序列推导，
 * 当前行动方一侧有高亮描边与「行动中」指示。
 * 桌面为纵向面板，移动端自动切换为紧凑横向布局。
 */
export function PlayerPanel({ side }: PlayerPanelProps) {
  const match = useBPStore((s) => s.match)
  const ninjaById = useNinjaStore((s) => s.getById)

  const { banSlots, pickSlots, acting } = useMemo(() => {
    if (!match) return { banSlots: [], pickSlots: [], acting: false }
    const phase = getPhase(match)
    const game = match.games[match.games.length - 1]
    const player = side === 'BLUE' ? game.blue : game.red
    const steps = phase.expanded.filter((e) => e.side === side)

    const bans = steps.filter((e) => e.action === 'BAN').map((_, i) => player.bans[i])
    const picks = steps.filter((e) => e.action === 'PICK').map((_, i) => player.picks[i])
    return {
      banSlots: bans,
      pickSlots: picks,
      acting: phase.side === side && !phase.sequenceComplete,
    }
  }, [match, side])

  if (!match) return null

  const isBlue = side === 'BLUE'
  const playerName = isBlue ? match.bluePlayerName : match.redPlayerName

  return (
    <aside
      className={`flex flex-col gap-3 rounded-xl border bg-ink-800/70 p-3 transition-colors lg:p-4 ${
        acting
          ? isBlue
            ? 'border-side-blue/70 shadow-[0_0_24px_-6px] shadow-side-blue/40'
            : 'border-side-red/70 shadow-[0_0_24px_-6px] shadow-side-red/40'
          : 'border-ink-600'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest ${
              isBlue ? 'bg-side-blue/20 text-side-blue-soft' : 'bg-side-red/20 text-side-red-soft'
            }`}
          >
            {isBlue ? 'BLUE 蓝方' : 'RED 红方'}
          </span>
          <span className="truncate text-sm font-medium text-fog-100">{playerName}</span>
        </div>
        {acting && (
          <span className={`flex items-center gap-1 text-[10px] ${isBlue ? 'text-side-blue-soft' : 'text-side-red-soft'}`}>
            <Radio size={10} className="animate-pulse" /> 行动中
          </span>
        )}
      </header>

      {banSlots.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold tracking-widest text-fog-600">BAN · 禁用</h4>
          <div className="flex gap-1.5">
            {banSlots.map((id, i) => (
              <BanSlot key={`ban-${i}`} ninja={id ? ninjaById(id) : undefined} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-1.5 text-[10px] font-semibold tracking-widest text-fog-600">PICK · 出战</h4>
        <div className="flex gap-1.5">
          {pickSlots.map((id, i) => (
            <PickSlot key={`pick-${i}`} ninja={id ? ninjaById(id) : undefined} order={i + 1} side={side} />
          ))}
        </div>
      </section>
    </aside>
  )
}
