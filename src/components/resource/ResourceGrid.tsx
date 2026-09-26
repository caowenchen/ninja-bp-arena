import type { DraftResource, DraftResourceType } from '@bp-core'
import type { MatchState } from '@/types/match'
import { canSelectResource, getResourceCardStatus } from '@bp-core'
import { ResourceCard } from './ResourceCard'

export function ResourceGrid({
  resources,
  resourceType,
  onSelect,
  onInspect,
  match,
  canSelect = true,
  lockedReason,
}: {
  resources: DraftResource[]
  resourceType: DraftResourceType
  onSelect: (resource: DraftResource) => void
  onInspect?: (resource: DraftResource) => void
  match: MatchState
  canSelect?: boolean
  lockedReason?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="grid" aria-label={`${resourceType} 资源列表`} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const selector = (document.activeElement as HTMLElement | null)?.hasAttribute('data-resource-inspect') ? '[data-resource-inspect]' : '[data-resource-card]:not(:disabled)'
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(selector)]
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (current < 0) return
      const columns = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 640 ? 3 : 2
      const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
      const target = buttons[Math.max(0, Math.min(buttons.length - 1, current + delta))]
      if (target) { event.preventDefault(); target.focus() }
    }}>
      {resources.map((resource) => {
        const status = getResourceCardStatus(match, resourceType, resource)
        const allowed = canSelect && canSelectResource(match, resourceType, resource.id, resource).allowed
        const reason = !canSelect && (status.status === 'AVAILABLE' || status.status === 'LOCKED') ? lockedReason ?? '当前不是可操作阶段' : status.reason
        return <ResourceCard key={resource.id} resource={resource} resourceType={resourceType} state={status.status} reason={reason} disabled={!allowed} onSelect={() => onSelect(resource)} onInspect={onInspect ? () => onInspect(resource) : undefined} />
      })}
    </div>
  )
}
