import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
import type { Ninja } from '@/types/ninja'
import type { MatchState } from '@/types/match'
import type { NinjaCardStatus } from '@/engine/bpEngine'
import { getNinjaCardStatus } from '@/engine/bpEngine'
import { NinjaCard } from './NinjaCard'

interface NinjaGridProps {
  ninjas: Ninja[]
  match: MatchState
  onPick: (ninja: Ninja) => void
}

/** 忍者选择网格：状态全部由引擎统一计算 */
export function NinjaGrid({ ninjas, match, onPick }: NinjaGridProps) {
  const cards = useMemo(
    () => ninjas.map((ninja) => ({ ninja, status: getNinjaCardStatus(match, ninja).status as NinjaCardStatus })),
    [ninjas, match],
  )

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-500 py-12 text-center">
        <SearchX size={28} className="text-fog-600" />
        <p className="text-sm text-fog-300">没有找到符合条件的忍者</p>
        <p className="text-xs text-fog-600">尝试修改搜索关键词或筛选条件</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-9 2xl:grid-cols-10">
      {cards.map(({ ninja, status }) => (
        <NinjaCard key={ninja.id} ninja={ninja} status={status} onPick={onPick} />
      ))}
    </div>
  )
}
