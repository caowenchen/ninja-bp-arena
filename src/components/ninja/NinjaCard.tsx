import { memo } from 'react'
import { Ban } from 'lucide-react'
import type { Ninja } from '@/types/ninja'
import type { NinjaCardStatus } from '@/engine/bpEngine'
import { NinjaAvatar } from './NinjaAvatar'

const QUALITY_STYLE: Record<string, string> = {
  S: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  A: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  B: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  C: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
}

interface NinjaCardProps {
  ninja: Ninja
  status: NinjaCardStatus
  onPick: (ninja: Ninja) => void
}

/**
 * 忍者卡片：AVAILABLE 可点击；其余状态仅作提示（点击弹 Toast），绝不误改状态。
 * React.memo + 引擎统一计算状态，保证 500+ 卡片时倒计时不会引发全量重渲染。
 */
export const NinjaCard = memo(function NinjaCard({ ninja, status, onPick }: NinjaCardProps) {
  const available = status === 'AVAILABLE'

  return (
    <button
      type="button"
      onClick={() => onPick(ninja)}
      aria-label={`${ninja.name}（${status === 'AVAILABLE' ? '可选' : status}）`}
      className={`group relative flex w-full flex-col overflow-hidden rounded-lg border text-left transition-all duration-150 ${
        available
          ? 'border-ink-500 bg-ink-800 hover:-translate-y-0.5 hover:border-side-blue/60 hover:shadow-lg hover:shadow-side-blue/10 active:scale-[0.98]'
          : 'border-ink-600 bg-ink-800/60'
      } ${status === 'DISABLED' ? 'opacity-40' : ''}`}
    >
      {/* 头像区 */}
      <div className="relative aspect-square w-full">
        <NinjaAvatar
          name={ninja.name}
          avatar={ninja.avatar}
          className={`h-full w-full ${status === 'BANNED' || status === 'USED' ? 'opacity-45 saturate-0' : ''}`}
          textClassName="text-2xl"
        />
        {/* BAN 斜杠遮罩 */}
        {status === 'BANNED' && <div className="ban-slash absolute inset-0" />}
        {/* 状态角标 */}
        {status === 'BANNED' && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-side-red/85 py-0.5 text-[10px] font-bold tracking-widest text-white">
            <Ban size={10} /> BAN
          </span>
        )}
        {status === 'BLUE_PICKED' && (
          <span className="absolute inset-x-0 bottom-0 bg-side-blue/85 py-0.5 text-center text-[10px] font-bold tracking-widest text-white">
            BLUE
          </span>
        )}
        {status === 'RED_PICKED' && (
          <span className="absolute inset-x-0 bottom-0 bg-side-red/85 py-0.5 text-center text-[10px] font-bold tracking-widest text-white">
            RED
          </span>
        )}
        {status === 'USED' && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/85 py-0.5 text-center text-[10px] font-bold tracking-widest text-fog-500">
            已使用
          </span>
        )}
        {status === 'DISABLED' && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/85 py-0.5 text-center text-[10px] font-bold tracking-widest text-fog-600">
            已停用
          </span>
        )}
      </div>

      {/* 信息区：固定两行高度，避免卡片高度跳动 */}
      <div className="flex h-10 w-full flex-col justify-center gap-1 px-1.5 py-1">
        <span className="name-clamp text-[11px] leading-tight text-fog-100">{ninja.name}</span>
        <div className="flex items-center gap-1">
          <span className={`rounded border px-1 text-[9px] font-bold leading-4 ${QUALITY_STYLE[ninja.quality] ?? ''}`}>
            {ninja.quality}
          </span>
          {ninja.tags.slice(0, 1).map((tag) => (
            <span key={tag} className="truncate text-[9px] leading-4 text-fog-600">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
})
