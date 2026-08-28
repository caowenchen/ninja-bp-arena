import type { NinjaQuality } from '@/types/ninja'

export type QualityFilter = 'ALL' | NinjaQuality

const OPTIONS: { value: QualityFilter; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'S', label: 'S' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
]

interface NinjaFilterProps {
  value: QualityFilter
  onChange: (value: QualityFilter) => void
}

/** 品质筛选（可与搜索叠加） */
export function NinjaFilter({ value, onChange }: NinjaFilterProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-ink-500 bg-ink-800 p-1" role="group" aria-label="品质筛选">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === opt.value ? 'bg-side-blue text-white' : 'text-fog-500 hover:bg-ink-600 hover:text-fog-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
