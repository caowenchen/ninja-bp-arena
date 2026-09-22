import type { DraftResource, DraftResourceType } from '@bp-core'
import type { MatchState } from '@/types/match'
import { ResourceCard } from './ResourceCard'

export function ResourceGrid({
  resources,
  resourceType,
  onSelect,
  match,
  canSelect = true,
  lockedReason,
}: {
  resources: DraftResource[]
  resourceType: DraftResourceType
  onSelect: (resource: DraftResource) => void
  match: MatchState
  canSelect?: boolean
  lockedReason?: string
}) {
  const game = match.games[match.games.length - 1]
  const auxType = resourceType === 'NINJA' ? 'SECRET_SCROLL' : resourceType
  const stateFor = (id: string): { state: 'AVAILABLE' | 'BLUE_PICKED' | 'RED_PICKED' | 'BANNED' | 'USED' | 'DISABLED' | 'LOCKED'; reason?: string } => {
    const item = resources.find((resource) => resource.id === id)
    if (!item?.enabled || item.deprecated) return { state: 'DISABLED', reason: '资源已停用' }
    const blue = game.blue.resources?.[auxType]
    const red = game.red.resources?.[auxType]
    if (blue?.bans.includes(id) || red?.bans.includes(id)) return { state: 'BANNED', reason: '本局已被禁用' }
    if (blue?.picks.includes(id)) return { state: 'BLUE_PICKED', reason: '本局已被蓝方选择' }
    if (red?.picks.includes(id)) return { state: 'RED_PICKED', reason: '本局已被红方选择' }
    const usedBefore = match.games.slice(0, -1).some((past) => past.blue.resources?.[auxType]?.picks.includes(id) || past.red.resources?.[auxType]?.picks.includes(id))
    if (usedBefore) return { state: 'USED', reason: '上一小局已使用' }
    if (!canSelect) return { state: 'LOCKED', reason: lockedReason ?? '当前不是可操作阶段' }
    return { state: 'AVAILABLE' }
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="grid" aria-label={`${resourceType} 资源列表`} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-resource-card]')]
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (current < 0) return
      const columns = window.innerWidth >= 1280 ? 4 : window.innerWidth >= 640 ? 3 : 2
      const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
      const target = buttons[Math.max(0, Math.min(buttons.length - 1, current + delta))]
      if (target) { event.preventDefault(); target.focus() }
    }}>
      {resources.map((resource) => {
        const status = stateFor(resource.id)
        return <ResourceCard key={resource.id} resource={resource} resourceType={resourceType} state={status.state} reason={status.reason} onSelect={() => onSelect(resource)} />
      })}
    </div>
  )
}
