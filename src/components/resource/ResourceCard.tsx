import { useState } from 'react'
import type { DraftResource, DraftResourceType } from '@bp-core'
import { RESOURCE_TYPE_LABEL } from '@bp-core'
import { isAssetKnownFailed, markAssetFailed, resolveResourceAsset } from '@/dataPack/assetResolver'

export function ResourceCard({
  resource,
  resourceType,
  disabled,
  state = 'AVAILABLE',
  reason,
  onSelect,
  onInspect,
}: {
  resource: DraftResource
  resourceType: DraftResourceType
  disabled?: boolean
  state?: 'AVAILABLE' | 'BLUE_PICKED' | 'RED_PICKED' | 'BANNED' | 'USED' | 'DISABLED' | 'LOCKED'
  reason?: string
  onSelect: () => void
  onInspect?: () => void
}) {
  const asset = resolveResourceAsset(resource)
  const [failed, setFailed] = useState(false)
  const showAsset = asset && !failed && !isAssetKnownFailed(asset)
  const locked = disabled ?? (!resource.enabled || Boolean(resource.deprecated) || state !== 'AVAILABLE')
  const statusLabel = state === 'BLUE_PICKED' ? '蓝方已选' : state === 'RED_PICKED' ? '红方已选' : state === 'BANNED' ? '已禁用' : state === 'USED' ? '已使用' : state === 'DISABLED' ? '已停用' : state === 'LOCKED' ? '不可操作' : '可选'
  const stateStyle = state === 'BLUE_PICKED' ? 'border-blue-team bg-blue-team/10' : state === 'RED_PICKED' ? 'border-red-team bg-red-team/10' : state === 'BANNED' ? 'border-red-team/70 bg-red-team/5' : state === 'AVAILABLE' ? 'border-ink-500 bg-ink-800 hover:border-gold-accent/70 hover:bg-ink-700' : 'border-border-muted bg-ink-800/60'
  return (
    <div className="min-w-0">
    <button
      type="button"
      aria-label={`选择${RESOURCE_TYPE_LABEL[resourceType]} ${resource.name}（${reason ?? statusLabel}${!locked && state !== 'AVAILABLE' ? '，当前仍可选择' : ''}）`}
      aria-disabled={locked}
      disabled={locked}
      title={reason ?? statusLabel}
      data-resource-card
      data-state={state}
      onClick={() => { if (!locked) onSelect() }}
      className={`relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent ${stateStyle} ${locked ? 'cursor-not-allowed' : 'hover:border-gold-accent'}`}
    >
      {showAsset ? <img src={asset} alt="" loading="lazy" decoding="async" width={40} height={40} onError={() => { markAssetFailed(asset); setFailed(true) }} className="h-10 w-10 rounded object-cover" /> : (
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded bg-ink-600 text-lg font-black text-fog-500">
          {resourceType === 'SECRET_SCROLL' ? '卷' : '灵'}
        </span>
      )}
      <span className="text-sm font-semibold text-fog-100">{resource.name}</span>
      {resource.tags?.length ? <span className="text-[10px] text-fog-600">{resource.tags.slice(0, 2).join(' · ')}</span> : null}
      <span className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${state === 'AVAILABLE' ? 'bg-emerald-500/15 text-emerald-300' : state === 'BLUE_PICKED' ? 'bg-blue-team text-white' : state === 'RED_PICKED' || state === 'BANNED' ? 'bg-red-team text-white' : 'bg-ink-600 text-fog-300'}`}>{statusLabel}</span>
    </button>
    {onInspect && <button type="button" data-resource-inspect onClick={onInspect} aria-label={`查看${resource.name}详情`} className="mt-1 min-h-9 w-full rounded border border-border-muted bg-surface-1 text-xs text-fog-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-accent">详情</button>}
    </div>
  )
}
