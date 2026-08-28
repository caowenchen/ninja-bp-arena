import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
import type { Ninja } from '@/types/ninja'
import type { MatchState } from '@/types/match'
import type { NinjaCardStatus } from '@/engine/bpEngine'
import { getNinjaCardStatus } from '@/engine/bpEngine'
import { NinjaCard } from './NinjaCard'

/** 状态筛选（与搜索/品质叠加） */
export type StatusFilter = 'ALL' | 'AVAILABLE' | 'BANNED' | 'USED' | 'PICKED'

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'AVAILABLE', label: '可用' },
  { value: 'BANNED', label: '已Ban' },
  { value: 'PICKED', label: '已选' },
  { value: 'USED', label: '已使用' },
]

interface NinjaGridProps {
  ninjas: Ninja[]
  match: MatchState
  statusFilter?: StatusFilter
  onPick: (ninja: Ninja) => void
}

/** 忍者选择网格：状态全部由引擎统一计算 */
export function NinjaGrid({ ninjas, match, statusFilter = 'ALL', onPick }: NinjaGridProps) {
  const cards = useMemo(
    () =>
      ninjas
        .map((ninja) => ({ ninja, status: getNinjaCardStatus(match, ninja).status as NinjaCardStatus }))
        .filter(({ status }) => {
          if (statusFilter === 'ALL') return true
          if (statusFilter === 'PICKED') return status === 'BLUE_PICKED' || status === 'RED_PICKED'
          return status === statusFilter
        }),
    [ninjas, match, statusFilter],
  )

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong py-12 text-center">
        <SearchX size={26} className="text-fog-600" />
        <p className="text-sm text-fog-300">没有找到符合条件的忍者</p>
        <p className="text-xs text-fog-600">尝试修改搜索关键词或筛选条件</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 2xl:grid-cols-6">
      {cards.map(({ ninja, status }) => (
        <NinjaCard key={ninja.id} ninja={ninja} status={status} onPick={onPick} />
      ))}
    </div>
  )
}
