import { Search, X } from 'lucide-react'

interface NinjaSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** 忍者搜索框（BP 页与忍者池页共用） */
export function NinjaSearch({ value, onChange, placeholder = '搜索忍者名称…' }: NinjaSearchProps) {
  return (
    <div className="relative flex-1 sm:max-w-xs">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog-600" />
      <input
        data-resource-search
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="搜索忍者"
        className="w-full rounded-lg border border-ink-500 bg-ink-800 py-2 pl-9 pr-9 text-sm text-fog-100 placeholder:text-fog-600 focus:border-side-blue/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-side-blue/40"
      />
      {value && (
        <button type="button" aria-label="清除搜索" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fog-500 hover:text-fog-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
