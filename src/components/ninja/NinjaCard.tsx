import { memo } from 'react'
import type { Ninja } from '@/types/ninja'
import type { NinjaCardStatus } from '@/engine/bpEngine'
import { NinjaAvatar } from './NinjaAvatar'

const QUALITY_STYLE: Record<string, string> = {
  S: 'bg-gold-accent/15 text-gold-accent border-gold-accent/40',
  A: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  B: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  C: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
}

const STATUS_LABEL: Record<NinjaCardStatus, string> = {
  AVAILABLE: '可选',
  BANNED: '已禁用',
  BLUE_PICKED: '蓝方已选',
  RED_PICKED: '红方已选',
  USED: '已使用',
  DISABLED: '已停用',
}

interface NinjaCardProps {
  ninja: Ninja
  status: NinjaCardStatus
  onPick: (ninja: Ninja) => void
  /** 数据包更新后 7 天内的新忍者 NEW 徽标 */
  isNew?: boolean
}

/**
 * 忍者卡片：头像占主要面积，名字沉底，品质用小角标。
 * 状态只靠 遮罩 / 描边 / 标签 / 透明度 表达，不做花哨背景。
 * React.memo + 引擎统一计算状态，倒计时变化不会引发卡片重渲染。
 */
export const NinjaCard = memo(function NinjaCard({ ninja, status, onPick, isNew }: NinjaCardProps) {
  const available = status === 'AVAILABLE'
  const dimmed = status === 'BANNED' || status === 'USED'
  const tooltip = `${ninja.name} · ${ninja.quality}${ninja.tags.length ? ` · ${ninja.tags.join(' / ')}` : ''} · ${STATUS_LABEL[status]}${ninja.dataVersion ? ` · 数据 ${ninja.dataVersion}` : ''}`

  return (
    <button
      type="button"
      onClick={() => onPick(ninja)}
      title={tooltip}
      aria-label={`${ninja.name}（${STATUS_LABEL[status]}）`}
      className={`group relative block w-full overflow-hidden rounded-md border text-left transition-all duration-150 ${
        available
          ? 'border-border-muted bg-surface-1 hover:z-10 hover:scale-[1.04] hover:border-blue-team/70'
          : 'border-border-muted/60 bg-surface-1/60'
      } ${status === 'DISABLED' ? 'opacity-30' : ''}`}
    >
      <div className="relative aspect-[3/4] w-full">
        <NinjaAvatar
          name={ninja.name}
          avatar={ninja.avatar}
          assetKey={ninja.assetKey}
          className={`h-full w-full ${dimmed ? 'opacity-50 saturate-0' : ''}`}
          textClassName="text-2xl"
        />
        {status === 'BANNED' && <div className="ban-slash absolute inset-0" />}

        {/* 品质角标 */}
        <span
          className={`absolute left-1 top-1 rounded-sm border px-1 text-[9px] font-bold leading-4 ${QUALITY_STYLE[ninja.quality] ?? ''}`}
        >
          {ninja.quality}
        </span>

        {/* NEW 徽标：数据包更新带来的新忍者 */}
        {isNew && (
          <span className="absolute right-1 top-1 rounded-sm bg-emerald-500/90 px-1 text-[9px] font-bold leading-4 text-white">
            NEW
          </span>
        )}

        {/* 状态标签：统一的底部窄条 */}
        {status === 'BANNED' && (
          <span className="absolute inset-x-0 bottom-0 bg-red-team/90 py-px text-center text-[9px] font-bold tracking-widest text-white">
            BAN
          </span>
        )}
        {status === 'BLUE_PICKED' && (
          <span className="absolute inset-x-0 bottom-0 bg-blue-team/90 py-px text-center text-[9px] font-bold tracking-widest text-white">
            BLUE
          </span>
        )}
        {status === 'RED_PICKED' && (
          <span className="absolute inset-x-0 bottom-0 bg-red-team/90 py-px text-center text-[9px] font-bold tracking-widest text-white">
            RED
          </span>
        )}
        {status === 'USED' && (
          <span className="absolute inset-x-0 bottom-0 bg-arena-bg/90 py-px text-center text-[9px] font-bold tracking-widest text-fog-500">
            已使用
          </span>
        )}
        {status === 'DISABLED' && (
          <span className="absolute inset-x-0 bottom-0 bg-arena-bg/90 py-px text-center text-[9px] font-bold tracking-widest text-fog-600">
            已停用
          </span>
        )}
      </div>

      {/* 名字：固定两行高度，保证整排卡片等高 */}
      <div className="flex h-8 items-center px-1">
        <span className="name-clamp text-[11px] leading-tight text-fog-100">{ninja.name}</span>
      </div>
    </button>
  )
})
