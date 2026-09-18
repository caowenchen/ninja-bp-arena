/**
 * 数据包体系（v0.4）统一出口。
 * 核心 Schema / 校验 / Diff / Checksum 在 Shared BP Core；
 * 本目录提供 Web 侧的加载 / 远程获取 / Store / 素材解析。
 */
export * from './types'
export { BUILT_IN_MANIFEST, BUILT_IN_NINJAS, builtInPack, cloneBuiltInNinjas } from './loader'
export {
  parseDataPackBundle,
  bundleToInstalledPack,
  exportDataPackBundle,
  diffPacks,
  summarizeDiff,
  exportNinjasCsv,
  parseNinjasCsv,
  computeDataHealth,
  type DataHealth,
  type ParseBundleResult,
} from './service'
export {
  resolveNinjaAsset,
  markAssetFailed,
  isAssetKnownFailed,
  resetFailedAssetCache,
} from './assetResolver'
export {
  RemoteFetchError,
  fetchRemoteManifest,
  fetchRemoteNinjas,
  assertRemoteUrl,
  REMOTE_MANIFEST_MAX_BYTES,
  REMOTE_NINJAS_MAX_BYTES,
  REMOTE_TIMEOUT_MS,
} from './remote'
export {
  useDataPackStore,
  getNewNinjaIds,
  getBuiltinUpdateNotice,
  acknowledgeBuiltinVersion,
  parseRoomNinjaSnapshot,
  currentPackMetadata,
  buildMatchPackSnapshot,
} from './store'
export { compactMatchForHistory, collectReferencedNinjaIds, buildSnapshotLookup } from './matchSnapshot'
