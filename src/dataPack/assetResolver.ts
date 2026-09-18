import type { DraftResourceBase, Ninja, NinjaDataPackManifest } from '@bp-core'

/**
 * Ninja Asset Resolver —— 头像 URL 的唯一解析入口。
 * 组件不允许直接 <img src={ninja.avatar}>，一律经过 resolveNinjaAsset。
 *
 * 优先级：
 *   1. 用户本地 override —— 忍者记录上的 avatar 字段（用户在池管理中编辑/导入的
 *      值会直接写在记录上，因此天然作为最高优先级覆盖数据包默认值）
 *   2. data pack avatar —— 数据包自带的完整 avatar URL
 *   3. asset base URL + assetKey —— manifest.assetBaseUrl + ninja.assetKey 拼接
 *      （数据 JSON 不写重复长 URL）
 *   4. undefined —— 组件显示 Placeholder
 *
 * Data Pack 与 Asset Pack 分离：没有素材时网站完全可用（占位图）。
 */

export function resolveNinjaAsset(ninja: Pick<Ninja, 'avatar' | 'assetKey'>, packManifest?: Pick<NinjaDataPackManifest, 'assetBaseUrl'> | null): string | undefined {
  // 1/2. 记录上的显式 avatar（用户编辑或数据包自带 URL）
  if (ninja.avatar && ninja.avatar.trim() !== '') return ninja.avatar
  // 3. assetBaseUrl + assetKey
  const key = ninja.assetKey?.trim()
  if (key && packManifest?.assetBaseUrl) {
    const base = packManifest.assetBaseUrl.endsWith('/') ? packManifest.assetBaseUrl : `${packManifest.assetBaseUrl}/`
    return key.startsWith('http') ? key : `${base}${key}`
  }
  // 4. 无素材（Placeholder）
  return undefined
}

export function resolveResourceAsset(
  resource: Pick<DraftResourceBase, 'asset' | 'avatar' | 'assetKey'>,
  packManifest?: Pick<NinjaDataPackManifest, 'assetBaseUrl'> | null,
): string | undefined {
  if (resource.asset?.trim()) return resource.asset
  return resolveNinjaAsset(resource, packManifest)
}

// ---------------------------------------------------------------------------
// 加载失败 URL 的会话级缓存：同一 session 内不再重复请求已知失败的地址
// ---------------------------------------------------------------------------

const failedUrls = new Set<string>()

export function markAssetFailed(url: string): void {
  if (url) failedUrls.add(url)
}

export function isAssetKnownFailed(url: string): boolean {
  return failedUrls.has(url)
}

/** 仅测试使用 */
export function resetFailedAssetCache(): void {
  failedUrls.clear()
}
