import type { DraftResourceBase, Ninja, NinjaDataPackManifest } from '@bp-core'

export interface AssetPackManifest {
  id: string
  version: string
  baseUrl: string
  overrides?: Record<string, string>
}

export type AssetHealth = 'OK' | 'MISSING' | 'INVALID_URL' | 'BROKEN_ASSET_KEY' | 'FALLBACK_USED'

export interface AssetResolution {
  url?: string
  health: AssetHealth
  source: 'USER_OVERRIDE' | 'ASSET_PACK' | 'RESOURCE' | 'DATA_PACK' | 'PLACEHOLDER'
}

function isSafeAssetUrl(value: string): boolean {
  return !/^data:/i.test(value) && (/^https:\/\//i.test(value) || value.startsWith('/'))
}

function joinAsset(base: string, key: string): string | undefined {
  if (!key || key.includes('..') || key.startsWith('/') || /^data:/i.test(key)) return undefined
  if (!isSafeAssetUrl(base)) return undefined
  return `${base.endsWith('/') ? base : `${base}/`}${key}`
}

/** 用户覆盖 > Asset Pack > 资源自带 > Data Pack base+key > 占位。 */
export function resolveAsset(
  resource: Pick<DraftResourceBase, 'asset' | 'avatar' | 'assetKey'> & { id?: string },
  options: {
    userOverride?: string
    assetPack?: AssetPackManifest | null
    packManifest?: Pick<NinjaDataPackManifest, 'assetBaseUrl'> | null
  } = {},
): AssetResolution {
  const candidates: Array<{ url?: string; source: AssetResolution['source'] }> = [
    { url: options.userOverride?.trim(), source: 'USER_OVERRIDE' },
    {
      url: (resource.id ? options.assetPack?.overrides?.[resource.id]?.trim() : undefined)
        ?? (resource.assetKey ? joinAsset(options.assetPack?.baseUrl ?? '', resource.assetKey) : undefined),
      source: 'ASSET_PACK',
    },
    { url: resource.asset?.trim() || resource.avatar?.trim(), source: 'RESOURCE' },
    { url: resource.assetKey ? joinAsset(options.packManifest?.assetBaseUrl ?? '', resource.assetKey) : undefined, source: 'DATA_PACK' },
  ]
  let rejected = false
  for (const candidate of candidates) {
    if (!candidate.url) continue
    if (!isSafeAssetUrl(candidate.url)) { rejected = true; continue }
    return { url: candidate.url, source: candidate.source, health: rejected ? 'FALLBACK_USED' : 'OK' }
  }
  if (resource.assetKey && !options.assetPack?.baseUrl && !options.packManifest?.assetBaseUrl) {
    return { source: 'PLACEHOLDER', health: 'BROKEN_ASSET_KEY' }
  }
  return { source: 'PLACEHOLDER', health: rejected ? 'INVALID_URL' : 'MISSING' }
}

export function resolveNinjaAsset(
  ninja: Pick<Ninja, 'avatar' | 'assetKey'> & { id?: string },
  packManifest?: Pick<NinjaDataPackManifest, 'assetBaseUrl'> | null,
): string | undefined {
  return resolveAsset(ninja, { packManifest }).url
}

export function resolveResourceAsset(
  resource: Pick<DraftResourceBase, 'id' | 'asset' | 'avatar' | 'assetKey'>,
  packManifest?: Pick<NinjaDataPackManifest, 'assetBaseUrl'> | null,
): string | undefined {
  return resolveAsset(resource, { packManifest }).url
}

const failedUrls = new Set<string>()
export function markAssetFailed(url: string): void { if (url) failedUrls.add(url) }
export function isAssetKnownFailed(url: string): boolean { return failedUrls.has(url) }
export function resetFailedAssetCache(): void { failedUrls.clear() }
