import { Search } from 'lucide-react'

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
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="搜索忍者"
        className="w-full rounded-lg border border-ink-500 bg-ink-800 py-2 pl-9 pr-3 text-sm text-fog-100 placeholder:text-fog-600 focus:border-side-blue/60 focus:outline-none"
      />
    </div>
  )
}
