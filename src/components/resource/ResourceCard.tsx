import type { DraftResource, DraftResourceType } from '@bp-core'
import { RESOURCE_TYPE_LABEL } from '@bp-core'
import { resolveResourceAsset } from '@/dataPack/assetResolver'

export function ResourceCard({
  resource,
  resourceType,
  disabled,
  onSelect,
}: {
  resource: DraftResource
  resourceType: DraftResourceType
  disabled?: boolean
  onSelect: () => void
}) {
  const asset = resolveResourceAsset(resource)
  return (
    <button
      type="button"
      aria-label={`选择${RESOURCE_TYPE_LABEL[resourceType]} ${resource.name}`}
      disabled={disabled || !resource.enabled || resource.deprecated}
      onClick={onSelect}
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-ink-500 bg-ink-800 p-3 text-center transition hover:border-gold-accent/70 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {asset ? <img src={asset} alt="" className="h-10 w-10 rounded object-cover" /> : (
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded bg-ink-600 text-lg font-black text-fog-500">
          {resourceType === 'SECRET_SCROLL' ? '卷' : '灵'}
        </span>
      )}
      <span className="text-sm font-semibold text-fog-100">{resource.name}</span>
      {resource.tags?.length ? <span className="text-[10px] text-fog-600">{resource.tags.slice(0, 2).join(' · ')}</span> : null}
    </button>
  )
}
