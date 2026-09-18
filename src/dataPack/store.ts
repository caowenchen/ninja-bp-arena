import { create } from 'zustand'
import type { InstalledDataPack, MatchPackMetadata, Ninja, NinjaDataPackManifest, OnlineNinjaSnapshot } from '@bp-core'
import { isRemotePackNewer, toOnlineNinjaSnapshots, validateDataPack, validateOnlineNinjaSnapshot, validatePackNinja } from '@bp-core'
import { useNinjaStore, setPoolMutationHook } from '@/store/ninjaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { BUILT_IN_PACK_ID, type DataPackUpdateState, type NinjaPoolSource } from './types'
import { builtInPack, cloneBuiltInNinjas } from './loader'
import { bundleToInstalledPack, diffPacks, parseDataPackBundle } from './service'
import { fetchRemoteManifest, fetchRemoteNinjas, RemoteFetchError } from './remote'
import { toast } from '@/store/toastStore'

/**
 * 数据包 Store：安装 / 激活 / 更新检查的中央状态。
 *
 * 职责划分：
 * - 本 Store：包注册表（installed_data_packs）、激活项（active_data_pack）、
 *   更新检查状态（data_pack_update_state）—— 全部持久化（schema v3）
 * - ninjaStore：继续拥有「当前生效池」（ninja_pool 镜像）；本 Store 负责在
 *   激活 / 更新包时写入生效池
 *
 * 激活语义（activePackId）：
 * - BUILT_IN_PACK_ID → 生效池 = 内置示例包（应用升级自动带新版本）
 * - 其它包 ID → 生效池 = 已安装包内容（远程包更新需用户确认）
 * - 'CUSTOM' → 生效池 = 用户手工编辑的数据（绝不被自动更新覆盖）
 */

const EMPTY_UPDATE_STATE: DataPackUpdateState = {
  autoCheckEnabled: true,
  lastCheckedAt: null,
  seenBuiltinVersion: null,
  remotes: {},
}

const NEW_BADGE_TTL_MS = 7 * 24 * 3600_000
/** 更新检查频率：每天最多一次（手动「检查更新」不受限） */
const CHECK_INTERVAL_MS = 24 * 3600_000

interface DataPackStore {
  installedPacks: InstalledDataPack[]
  /** 最近一次用户自定义池；切换数据包时保留，允许稍后切回 */
  customPool: Ninja[] | null
  activePackId: string
  updateState: DataPackUpdateState
  hydrated: boolean

  /** 应用启动引导：v2 用户迁移分类 + 内置包版本对齐。幂等。 */
  init: () => void
  /** 当前生效包的 manifest（BUILT_IN / 已安装包；CUSTOM 为 null） */
  activePack: () => InstalledDataPack | null
  /** 当前池来源 */
  poolSource: () => NinjaPoolSource

  /** 安装数据包（文件导入 / 远程更新），可选择立即激活 */
  installPack: (pack: InstalledDataPack, options?: { activate?: boolean }) => { added: number; updated: number }
  /** 激活已安装的包（或内置 / CUSTOM） */
  activatePack: (id: string) => void
  /** 删除已安装包（内置不可删；激活中的包先切换） */
  removePack: (id: string) => { ok: boolean; error?: string }

  // ---- 远程更新 ----
  /** 检查远程更新（force = 忽略每日频率限制） */
  checkRemoteUpdate: (url: string, options?: { force?: boolean }) => Promise<
    | { status: 'UP_TO_DATE' }
    | { status: 'NEWER'; manifest: NinjaDataPackManifest }
    | { status: 'OLD' }
    | { status: 'ERROR'; message: string }
  >
  /** 应用远程更新：完整下载 → 校验 → checksum → 预览（不动本地数据） */
  prepareRemoteUpdate: (url: string) => Promise<
    | { ok: true; pack: InstalledDataPack; addedIds: string[] }
    | { ok: false; message: string }
  >
  /** 确认应用已预览的更新（原子：全部就绪后才写入） */
  confirmRemoteUpdate: (url: string, pack: InstalledDataPack, addedIds: string[]) => void
  /** 设置自动检查更新开关 */
  setAutoCheckEnabled: (enabled: boolean) => void

  // ---- 内部 ----
  /** ninjaStore 任意手工变更后调用：来源标记为 CUSTOM（不覆盖用户数据） */
  _markCustom: () => void
  _persist: () => void
}

function loadInstalled(): InstalledDataPack[] {
  const raw = loadJSON<unknown>(STORAGE_KEYS.installedDataPacks, [])
  if (!Array.isArray(raw)) return []
  const valid: InstalledDataPack[] = []
  for (const item of raw) {
    const rec = item as Record<string, unknown>
    const manifest = rec?.manifest as NinjaDataPackManifest | undefined
    if (manifest && Array.isArray(rec.ninjas) && validateDataPack(manifest, rec.ninjas).length === 0) {
      valid.push(item as InstalledDataPack)
    }
  }
  return valid
}

function loadCustomPool(): Ninja[] | null {
  const raw = loadJSON<unknown>(STORAGE_KEYS.customNinjaPool, null)
  if (!Array.isArray(raw)) return null
  const recovered = raw.filter((item, index) => validatePackNinja(item, index).length === 0) as Ninja[]
  return recovered.length > 0 ? recovered : null
}

/** 与内置池逐条比较，判断 v2 遗留池是「未修改的默认」还是「自定义」 */
export function poolEqualsBuiltIn(pool: Ninja[]): boolean {
  const builtIn = builtInPack().ninjas
  if (pool.length !== builtIn.length) return false
  // v0.3.x 的默认池没有 v0.4 新增的 slug / dataVersion 等字段。
  // 迁移判断只比较旧 schema 已存在的字段，既能识别“未修改默认池”，
  // 又不会把改名、启停、标签或头像等真实用户改动误判为默认数据。
  const legacyShape = (n: Ninja) => JSON.stringify({
    id: n.id,
    name: n.name,
    aliases: n.aliases,
    avatar: n.avatar,
    quality: n.quality,
    tags: n.tags,
    enabled: n.enabled,
    sortOrder: n.sortOrder,
    version: n.version,
    releaseDate: n.releaseDate,
    remark: n.remark,
  })
  const poolById = new Map(pool.map((n) => [n.id, n]))
  return builtIn.every((n) => {
    const existing = poolById.get(n.id)
    return existing !== undefined && legacyShape(existing) === legacyShape(n)
  })
}

export const useDataPackStore = create<DataPackStore>()((set, get) => ({
  installedPacks: loadInstalled(),
  customPool: loadCustomPool(),
  activePackId: loadJSON<string>(STORAGE_KEYS.activeDataPack, BUILT_IN_PACK_ID, (v) => typeof v === 'string' && v.length > 0),
  updateState: (() => {
    const loaded = loadJSON<Partial<DataPackUpdateState> | null>(
      STORAGE_KEYS.dataPackUpdateState,
      null,
      (v) => typeof v === 'object' && v !== null,
    )
    return loaded ? { ...EMPTY_UPDATE_STATE, ...loaded } : EMPTY_UPDATE_STATE
  })(),
  hydrated: false,

  init: () => {
    if (get().hydrated) return
    // 手工变更降级 CUSTOM 的钩子注入（避免 ninjaStore ↔ dataPackStore 模块循环依赖）
    setPoolMutationHook(() => get()._markCustom())
    const ninjaStore = useNinjaStore.getState()
    const current = ninjaStore.ninjas
    let activePackId = get().activePackId

    // ---- v2 → v3 迁移分类：无激活记录时按池内容判定 ----
    if (!loadJSON<unknown>(STORAGE_KEYS.activeDataPack, null)) {
      activePackId = poolEqualsBuiltIn(current) ? BUILT_IN_PACK_ID : 'CUSTOM'
      set({
        activePackId,
        ...(activePackId === 'CUSTOM' ? { customPool: current.map((n) => ({ ...n })) } : {}),
      })
    }

    // ---- 激活包与生效池对齐 ----
    if (activePackId === BUILT_IN_PACK_ID) {
      // 应用升级可能带新版本内置包：先 diff 记录 NEW 徽标，再对齐生效池
      const bundled = builtInPack()
      const addedIds = diffPacks({ ninjas: current }, bundled).added.map((n) => n.id)
      if (addedIds.length > 0) {
        const state = get().updateState
        set({
          updateState: {
            ...state,
            newNinjaBadge: { appliedAt: new Date().toISOString(), ids: addedIds },
          },
        })
      }
      useNinjaStore.getState().applyPackPool(cloneBuiltInNinjas(), 'BUILT_IN', BUILT_IN_PACK_ID)
    } else if (activePackId !== 'CUSTOM') {
      const pack = get().installedPacks.find((p) => p.manifest.id === activePackId)
      if (!pack) {
        // 激活包丢失（损坏被清）：回退内置，绝不平白丢失可用池
        activePackId = BUILT_IN_PACK_ID
        set({ activePackId })
        useNinjaStore.getState().applyPackPool(cloneBuiltInNinjas(), 'BUILT_IN', BUILT_IN_PACK_ID)
      } else {
        useNinjaStore.getState().applyPackPool(pack.ninjas.map((n) => ({ ...n })), 'REMOTE_PACK', pack.manifest.id)
      }
    }
    // CUSTOM：优先恢复专用快照；首次迁移时则把当前 v0.3 池保存下来。
    else {
      const customPool = get().customPool
      if (customPool) {
        useNinjaStore.getState().applyPackPool(customPool.map((n) => ({ ...n })), 'CUSTOM', 'CUSTOM')
      } else {
        set({ customPool: current.map((n) => ({ ...n })) })
        useNinjaStore.getState().setPoolSource('CUSTOM', 'CUSTOM')
      }
    }

    // ---- 内置包版本记录：首次使用记录当前版本；之后应用升级带来新版本时，
    //      由 getBuiltinUpdateNotice() 在首页给出低干扰提示 ----
    const updateState = get().updateState
    if (!updateState.seenBuiltinVersion) {
      set({
        updateState: { ...updateState, seenBuiltinVersion: builtInPack().manifest.version },
      })
    }
    set({ hydrated: true })
    get()._persist()
  },

  activePack: () => {
    const id = get().activePackId
    if (id === 'CUSTOM') return null
    if (id === BUILT_IN_PACK_ID) return builtInPack()
    return get().installedPacks.find((p) => p.manifest.id === id) ?? null
  },

  poolSource: () => {
    const id = get().activePackId
    if (id === 'CUSTOM') return 'CUSTOM'
    if (id === BUILT_IN_PACK_ID) return 'BUILT_IN'
    return 'REMOTE_PACK'
  },

  installPack: (pack, options) => {
    const diff = diffPacks({ ninjas: useNinjaStore.getState().ninjas }, pack)
    const installed = get().installedPacks.filter((p) => p.manifest.id !== pack.manifest.id)
    set({ installedPacks: [...installed, pack] })
    if (options?.activate !== false) {
      set({ activePackId: pack.manifest.id })
      useNinjaStore
        .getState()
        .applyPackPool(
          pack.ninjas.map((n) => ({ ...n })),
          pack.origin === 'BUILT_IN' ? 'BUILT_IN' : 'REMOTE_PACK',
          pack.manifest.id,
        )
    }
    get()._persist()
    return { added: diff.added.length, updated: diff.updated.length }
  },

  activatePack: (id) => {
    if (id !== 'CUSTOM' && id !== BUILT_IN_PACK_ID && !get().installedPacks.some((p) => p.manifest.id === id)) return
    if (id === 'CUSTOM' && !get().customPool) return
    set({ activePackId: id })
    if (id === 'CUSTOM') {
      const customPool = get().customPool
      if (!customPool) return
      useNinjaStore.getState().applyPackPool(customPool.map((n) => ({ ...n })), 'CUSTOM', 'CUSTOM')
    } else if (id === BUILT_IN_PACK_ID) {
      useNinjaStore.getState().applyPackPool(cloneBuiltInNinjas(), 'BUILT_IN', BUILT_IN_PACK_ID)
    } else {
      const pack = get().installedPacks.find((p) => p.manifest.id === id)
      if (pack) {
        useNinjaStore
          .getState()
          .applyPackPool(pack.ninjas.map((n) => ({ ...n })), 'REMOTE_PACK', pack.manifest.id)
      }
    }
    get()._persist()
  },

  removePack: (id) => {
    if (id === BUILT_IN_PACK_ID) return { ok: false, error: '内置数据包不能删除，只能恢复' }
    if (get().activePackId === id) return { ok: false, error: '该数据包正在使用，请先切换到其它数据包' }
    set({ installedPacks: get().installedPacks.filter((p) => p.manifest.id !== id) })
    get()._persist()
    return { ok: true }
  },

  checkRemoteUpdate: async (url, options) => {
    const state = get().updateState
    const remote = state.remotes[url]
    const last = remote?.lastCheckedAt ? Date.parse(remote.lastCheckedAt) : 0
    if (!options?.force && Date.now() - last < CHECK_INTERVAL_MS) {
      if (remote?.pending) return { status: 'NEWER', manifest: remote.pending.manifest }
      return { status: 'UP_TO_DATE' }
    }
    const active = get().activePack()
    let manifest: NinjaDataPackManifest
    try {
      manifest = await fetchRemoteManifest(url)
    } catch (err) {
      if (err instanceof RemoteFetchError) return { status: 'ERROR', message: err.message }
      return { status: 'ERROR', message: err instanceof Error ? err.message : String(err) }
    }
    const nextRemotes: DataPackUpdateState['remotes'] = {
      ...state.remotes,
      [url]: { url, lastCheckedAt: new Date().toISOString() },
    }
    // 更新已有远程包时必须和“同一来源/同一包”比较，而不是和当前激活包比较；
    // 对从未安装过的新 URL，一律进入预览安装流程。
    const installed = get().installedPacks.find((p) => p.remoteUrl === url || p.manifest.id === manifest.id)
    const localManifest = installed?.manifest ?? (active?.manifest.id === manifest.id ? active.manifest : null)
    const newer = localManifest ? isRemotePackNewer(localManifest, manifest) : true
    if (newer) {
      nextRemotes[url] = { ...nextRemotes[url], pending: { manifest, checkedAt: new Date().toISOString() } }
    }
    set({ updateState: { ...get().updateState, lastCheckedAt: new Date().toISOString(), remotes: nextRemotes } })
    get()._persist()
    if (!newer) return { status: localManifest && !newer ? 'OLD' : 'UP_TO_DATE' }
    return { status: 'NEWER', manifest }
  },

  prepareRemoteUpdate: async (url) => {
    const pending = get().updateState.remotes[url]?.pending
    if (!pending) return { ok: false, message: '请先检查更新' }
    try {
      const ninjasText = await fetchRemoteNinjas(url, 'ninjas.json')
      const parsed = await parseDataPackBundle(
        JSON.stringify({ manifest: pending.manifest, ninjas: JSON.parse(ninjasText) }),
      )
      if (!parsed.ok || !parsed.manifest || !parsed.ninjas) {
        return { ok: false, message: parsed.errors[0] ?? '数据包校验失败' }
      }
      // checksum：manifest 提供了就必须匹配（SHA-256 规范化 JSON）
      if (pending.manifest.checksum && parsed.checksum !== pending.manifest.checksum) {
        return { ok: false, message: '数据校验失败（checksum 不匹配），已取消更新' }
      }
      const pack = bundleToInstalledPack(
        { manifest: parsed.manifest, ninjas: parsed.ninjas },
        'URL',
        url,
      )
      const addedIds = diffPacks({ ninjas: useNinjaStore.getState().ninjas }, pack).added.map((n) => n.id)
      return { ok: true, pack, addedIds }
    } catch (err) {
      if (err instanceof RemoteFetchError) return { ok: false, message: err.message }
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },

  confirmRemoteUpdate: (url, pack, addedIds) => {
    get().installPack(pack, { activate: true })
    const state = get().updateState
    set({
      updateState: {
        ...state,
        remotes: {
          ...state.remotes,
          [url]: { url, lastCheckedAt: new Date().toISOString() },
        },
        ...(addedIds.length > 0
          ? { newNinjaBadge: { appliedAt: new Date().toISOString(), ids: addedIds } }
          : {}),
      },
    })
    get()._persist()
  },

  setAutoCheckEnabled: (enabled) => {
    set({ updateState: { ...get().updateState, autoCheckEnabled: enabled } })
    get()._persist()
  },

  _markCustom: () => {
    const customPool = useNinjaStore.getState().ninjas.map((n) => ({ ...n }))
    set({ customPool })
    if (get().activePackId === 'CUSTOM') {
      get()._persist()
      return
    }
    set({ activePackId: 'CUSTOM' })
    useNinjaStore.getState().setPoolSource('CUSTOM', 'CUSTOM')
    get()._persist()
  },

  _persist: () => {
    const results = [
      saveJSON(STORAGE_KEYS.installedDataPacks, get().installedPacks),
      saveJSON(STORAGE_KEYS.activeDataPack, get().activePackId),
      saveJSON(STORAGE_KEYS.dataPackUpdateState, get().updateState),
      ...(get().customPool ? [saveJSON(STORAGE_KEYS.customNinjaPool, get().customPool)] : []),
    ]
    if (results.includes('quota')) toast('本地存储空间不足，数据包设置可能未保存', 'error')
  },
}))

// ---------------------------------------------------------------------------
// 选择器 / 辅助
// ---------------------------------------------------------------------------

/** NEW 徽标（7 天内的新增忍者 id 集合） */
export function getNewNinjaIds(): Set<string> {
  const badge = useDataPackStore.getState().updateState.newNinjaBadge
  if (!badge) return new Set()
  if (Date.now() - Date.parse(badge.appliedAt) > NEW_BADGE_TTL_MS) return new Set()
  return new Set(badge.ids)
}

/** 内置包是否随应用更新过（用户尚未确认） */
export function getBuiltinUpdateNotice(): { version: string } | null {
  const state = useDataPackStore.getState()
  const bundled = builtInPack().manifest.version
  if (!state.updateState.seenBuiltinVersion) {
    // 首次使用：记录当前版本，不提示
    return null
  }
  return state.updateState.seenBuiltinVersion !== bundled ? { version: bundled } : null
}

/** 用户确认内置包更新提示 */
export function acknowledgeBuiltinVersion(): void {
  const store = useDataPackStore.getState()
  useDataPackStore.setState({
    updateState: { ...store.updateState, seenBuiltinVersion: builtInPack().manifest.version },
  })
  store._persist()
}

// ---------------------------------------------------------------------------
// 在线房间：会话级快照（绝不写入用户本地池）
// ---------------------------------------------------------------------------

/** 校验并提取房间忍者快照（旧房间 pool = {id,enabled}[] → 名称回退为 id） */
export function parseRoomNinjaSnapshot(pool: unknown): { ninjas: Ninja[]; valid: boolean } {
  if (!Array.isArray(pool)) return { ninjas: [], valid: false }
  const ninjas: Ninja[] = []
  let valid = true
  pool.forEach((item, index) => {
    const rec = item as Record<string, unknown>
    if (rec && typeof rec.name === 'string' && typeof rec.quality === 'string') {
      const errors = validateOnlineNinjaSnapshot(item, index)
      if (errors.length > 0) {
        valid = false
        return
      }
      ninjas.push({
        id: rec.id as string,
        name: rec.name as string,
        enabled: rec.enabled as boolean,
        quality: rec.quality as Ninja['quality'],
        ...(typeof rec.avatar === 'string' && rec.avatar ? { avatar: rec.avatar } : {}),
        ...(typeof rec.assetKey === 'string' && rec.assetKey ? { assetKey: rec.assetKey } : {}),
        tags: [],
      })
    } else if (rec && typeof rec.id === 'string') {
      // 旧格式 {id, enabled}：名称回退
      ninjas.push({
        id: rec.id as string,
        name: rec.id as string,
        enabled: rec.enabled !== false,
        quality: 'B',
        tags: [],
      })
      valid = false
    } else {
      valid = false
    }
  })
  return { ninjas, valid }
}

/** 比赛创建时的数据包元信息（历史记录用） */
export function currentPackMetadata(): MatchPackMetadata | null {
  const pack = useDataPackStore.getState().activePack()
  if (!pack) return null
  return {
    packId: pack.manifest.id,
    schemaVersion: pack.manifest.schemaVersion,
    ...(pack.manifest.version ? { packVersion: pack.manifest.version } : {}),
    ...(pack.manifest.checksum ? { checksum: pack.manifest.checksum } : {}),
  }
}

/** 比赛创建时的完整忍者池快照（Local Match Snapshot） */
export function buildMatchPackSnapshot(): { dataPack?: MatchPackMetadata; ninjaSnapshot: OnlineNinjaSnapshot[] } {
  const ninjaStore = useNinjaStore.getState()
  const pack = useDataPackStore.getState().activePack()
  const dataPack = currentPackMetadata()
  return {
    ...(dataPack ? { dataPack } : {}),
    ninjaSnapshot: toOnlineNinjaSnapshots(ninjaStore.ninjas, pack?.manifest.assetBaseUrl),
  }
}
