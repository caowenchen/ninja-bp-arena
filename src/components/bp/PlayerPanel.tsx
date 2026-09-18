import { useMemo } from 'react'
import { Radio } from 'lucide-react'
import type { Side } from '@/types/bp'
import { useMatchSource } from '@/matchSource/context'
import { getPhase } from '@/engine/bpEngine'
import { useNinjaLookup } from '@/hooks/useNinjaLookup'
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
  const { getById: ninjaById } = useNinjaLookup(match)

  const { bans, picks, hasBanPhase, acting } = useMemo(() => {
    if (!match) return { bans: [] as (string | undefined)[], picks: [] as (string | undefined)[], hasBanPhase: false, acting: false }
    const phase = getPhase(match)
    const game = match.games[match.games.length - 1]
    const player = side === 'BLUE' ? game.blue : game.red
    const steps = phase.expanded.filter((e) => e.side === side && e.resourceType === 'NINJA')
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
  const game = match.games[match.games.length - 1]
  const player = side === 'BLUE' ? game.blue : game.red
  const phase = getPhase(match)

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

      {(['SECRET_SCROLL', 'SUMMON'] as const).map((resourceType) => {
        const slots = phase.expanded.filter((step) => step.side === side && step.resourceType === resourceType && step.action === 'PICK').length
        if (!slots) return null
        const ids = player.resources?.[resourceType]?.picks ?? []
        const lookup = new Map((source.matchResources?.[resourceType] ?? []).map((item) => [item.id, item.name]))
        return (
          <section key={resourceType}>
            <h4 className="mb-1.5 text-[9px] font-bold tracking-[0.25em] text-fog-600">
              {resourceType === 'SECRET_SCROLL' ? 'SECRET SCROLL · 秘卷' : 'SUMMON · 通灵'}
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: slots }, (_, index) => (
                <div key={index} className="flex min-h-12 items-center justify-center rounded border border-ink-500 bg-ink-800 px-2 text-center text-xs text-fog-300">
                  {ids[index] ? (lookup.get(ids[index]) ?? ids[index]) : `${index + 1}`}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </aside>
  )
}
