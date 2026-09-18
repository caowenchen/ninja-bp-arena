import type { DraftResource, DraftResourceType } from '@bp-core'
import { ResourceCard } from './ResourceCard'

export function ResourceGrid({
  resources,
  resourceType,
  onSelect,
}: {
  resources: DraftResource[]
  resourceType: DraftResourceType
  onSelect: (resource: DraftResource) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="list" aria-label={`${resourceType} 资源列表`}>
      {resources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} resourceType={resourceType} onSelect={() => onSelect(resource)} />
      ))}
    </div>
  )
}
