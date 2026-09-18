import type {
  BattleResourceSnapshot,
  DraftResource,
  DraftResourceType,
  Ninja,
  OnlineNinjaSnapshot,
  OnlineResourceSnapshot,
  SecretScroll,
  Summon,
} from './types.ts'

export interface BattleResources {
  ninjas: Ninja[]
  secretScrolls: SecretScroll[]
  summons: Summon[]
}

export const RESOURCE_TYPE_LABEL: Record<DraftResourceType, string> = {
  NINJA: '忍者',
  SECRET_SCROLL: '秘卷',
  SUMMON: '通灵',
}

export function emptyBattleResources(): BattleResources {
  return { ninjas: [], secretScrolls: [], summons: [] }
}

export function getResourcesByType(resources: BattleResources, type: DraftResourceType): DraftResource[] {
  if (type === 'NINJA') return resources.ninjas
  if (type === 'SECRET_SCROLL') return resources.secretScrolls
  return resources.summons
}

export function getResource(
  resources: BattleResources,
  type: DraftResourceType,
  id: string,
): DraftResource | undefined {
  return getResourcesByType(resources, type).find((item) => item.id === id)
}

export function resolveResourceName(
  resources: BattleResources,
  type: DraftResourceType,
  id: string,
): string {
  return getResource(resources, type, id)?.name ?? `未知${RESOURCE_TYPE_LABEL[type]} (${id})`
}

export function resolveResourceMetadata(
  resources: BattleResources,
  type: DraftResourceType,
  id: string,
): DraftResource | { id: string; name: string; tags: string[]; enabled: false } {
  return getResource(resources, type, id) ?? {
    id,
    name: `未知${RESOURCE_TYPE_LABEL[type]} (${id})`,
    tags: [],
    enabled: false,
  }
}

export function resolveResourceAssetValue(resource: Pick<DraftResource, 'asset' | 'avatar' | 'assetKey'>): string | undefined {
  return resource.asset?.trim() || resource.avatar?.trim() || resource.assetKey?.trim() || undefined
}

export function snapshotResources(snapshot: BattleResourceSnapshot | undefined): BattleResources {
  if (!snapshot) return emptyBattleResources()
  return {
    ninjas: snapshot.ninjas.map((item) => ({ ...item, tags: [] })),
    secretScrolls: snapshot.secretScrolls.map((item) => ({ ...item, resourceType: 'SECRET_SCROLL' as const, tags: item.tags ?? [] })),
    summons: snapshot.summons.map((item) => ({ ...item, resourceType: 'SUMMON' as const, tags: item.tags ?? [] })),
  }
}

function resolveAsset(resource: DraftResource, assetBaseUrl?: string): { asset?: string; avatar?: string; assetKey?: string } {
  const explicit = resource.asset?.trim() || resource.avatar?.trim()
  const key = resource.assetKey?.trim()
  const base = assetBaseUrl ? (assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`) : undefined
  const resolved = !explicit && key && base ? (/^https:\/\//i.test(key) ? key : `${base}${key}`) : undefined
  return {
    ...(resource.asset ? { asset: resource.asset } : {}),
    ...(resource.avatar ? { avatar: resource.avatar } : resolved ? { avatar: resolved } : {}),
    ...(key ? { assetKey: key } : {}),
  }
}

export function toOnlineResourceSnapshots(
  type: DraftResourceType,
  resources: DraftResource[],
  assetBaseUrl?: string,
): OnlineResourceSnapshot[] {
  return resources.map((resource) => ({
    resourceType: type,
    id: resource.id,
    name: resource.name,
    enabled: resource.enabled !== false && resource.deprecated !== true,
    ...('quality' in resource ? { quality: resource.quality } : {}),
    ...resolveAsset(resource, assetBaseUrl),
    ...(resource.tags.length ? { tags: resource.tags } : {}),
  }))
}

export function toBattleResourceSnapshot(
  resources: BattleResources,
  assetBaseUrl?: string,
): BattleResourceSnapshot {
  const ninjas = toOnlineResourceSnapshots('NINJA', resources.ninjas, assetBaseUrl).map((item) => ({
    id: item.id,
    name: item.name,
    enabled: item.enabled,
    quality: item.quality ?? 'C',
    ...(item.avatar ? { avatar: item.avatar } : {}),
    ...(item.assetKey ? { assetKey: item.assetKey } : {}),
  })) satisfies OnlineNinjaSnapshot[]
  return {
    ninjas,
    secretScrolls: toOnlineResourceSnapshots('SECRET_SCROLL', resources.secretScrolls, assetBaseUrl),
    summons: toOnlineResourceSnapshots('SUMMON', resources.summons, assetBaseUrl),
  }
}

export function findGlobalIdCollisions(resources: BattleResources): string[] {
  const seen = new Map<string, DraftResourceType>()
  const collisions = new Set<string>()
  for (const type of ['NINJA', 'SECRET_SCROLL', 'SUMMON'] as const) {
    for (const item of getResourcesByType(resources, type)) {
      const prior = seen.get(item.id)
      if (prior && prior !== type) collisions.add(item.id)
      else seen.set(item.id, type)
    }
  }
  return [...collisions]
}
