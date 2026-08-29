import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import type { Side } from '@/types/bp'
import { useMatchSource } from '@/matchSource/context'
import { getPhase } from '@/engine/bpEngine'
import { useNinjaStore } from '@/store/ninjaStore'
import { BanSlot } from './BanSlot'
import { PickSlot } from './PickSlot'

interface PlayerPanelProps {
  side: Side
}

/**
 * 阵容面板（桌面端左右两侧）：
 * - PICK 使用接近人物卡比例的大槽位，形成 BLUE VS RED 对阵感
 * - BAN 槽位更小、灰阶，明显区别于 Pick
 * - 当前行动方一侧轻微强化（描边 + 阴影），另一侧降低视觉权重
 * 槽位数量由当前局的规则序列推导；名字直接可见，不只显示 P1/P2/P3。
 */
export function PlayerPanel({ side }: PlayerPanelProps) {
  const source = useMatchSource()
  const match = source.match
  const ninjaById = useNinjaStore((s) => s.getById)

  const { bans, picks, hasBanPhase, acting } = useMemo(() => {
    if (!match) return { bans: [] as (string | undefined)[], picks: [] as (string | undefined)[], hasBanPhase: false, acting: false }
    const phase = getPhase(match)
    const game = match.games[match.games.length - 1]
    const player = side === 'BLUE' ? game.blue : game.red
    const steps = phase.expanded.filter((e) => e.side === side)
    return {
      bans: steps.filter((e) => e.action === 'BAN').map((_, i) => player.bans[i]),
      picks: steps.filter((e) => e.action === 'PICK').map((_, i) => player.picks[i]),
      hasBanPhase: steps.some((e) => e.action === 'BAN'),
      acting: phase.side === side && !phase.sequenceComplete,
    }
  }, [match, side])

  if (!match) return null

  const isBlue = side === 'BLUE'
  const playerName = isBlue ? match.bluePlayerName : match.redPlayerName
  const teamColor = isBlue ? 'text-blue-team-soft' : 'text-red-team-soft'

  return (
    <aside
      className={`flex flex-col gap-3.5 rounded-lg border bg-surface-1/70 p-3.5 transition-all ${
        acting
          ? isBlue
            ? 'border-blue-team/70 shadow-[0_0_28px_-8px] shadow-blue-team/50'
            : 'border-red-team/70 shadow-[0_0_28px_-8px] shadow-red-team/50'
          : 'border-border-muted opacity-85'
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-muted pb-2.5">
        <div className="min-w-0">
          <span className={`text-[10px] font-bold tracking-[0.2em] ${teamColor}`}>
            {isBlue ? 'BLUE' : 'RED'} · {isBlue ? '蓝方' : '红方'}
          </span>
          <p className="truncate text-base font-bold text-fog-100">{playerName}</p>
        </div>
        {acting && (
          <span className={`flex shrink-0 items-center gap-1 text-[10px] font-medium ${teamColor}`}>
            <Radio size={10} className="animate-pulse" /> 行动中
          </span>
        )}
      </header>

      {hasBanPhase && (
        <section>
          <h4 className="mb-1.5 text-[9px] font-bold tracking-[0.25em] text-fog-600">BAN · 禁用</h4>
          <div className="flex gap-2">
            {bans.map((id, i) => (
              <BanSlot key={`ban-${i}`} ninja={id ? ninjaById(id) : undefined} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-1.5 text-[9px] font-bold tracking-[0.25em] text-fog-600">PICK · 出战</h4>
        <div className="grid grid-cols-3 gap-2">
          {picks.map((id, i) => (
            <PickSlot key={`pick-${i}`} ninja={id ? ninjaById(id) : undefined} order={i + 1} side={side} />
          ))}
        </div>
      </section>
    </aside>
  )
}
