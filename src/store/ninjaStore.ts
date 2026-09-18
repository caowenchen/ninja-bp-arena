import { create } from 'zustand'
import type { Ninja } from '@/types/ninja'
import { NINJA_POOL } from '@/data/ninjas'
import { validateNinjaRecord } from '@/engine/matchValidator'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { mergeNinjas } from '@/utils/importExport'
import type { NinjaPoolSource } from '@/dataPack/types'

/**
 * 忍者池 Store：增删改查 + 启用/禁用 + JSON 导入合并 + 批量操作。
 * 每次变更立即持久化到 localStorage（ninja_pool）。
 * 加载时逐条校验，损坏条目丢弃并警告，全部损坏则回退内置示例池。
 *
 * v0.4 数据包体系：本 Store 继续拥有「当前生效池」；
 * poolSource / activePackId 由 dataPackStore 管理（激活包时写入这里）。
 * 任何手工变更（增删改 / 导入 / 启停）都会把来源标记为 CUSTOM，
 * 避免用户数据被数据包更新悄悄覆盖。
 */

function sanitizePool(raw: unknown): Ninja[] {
  if (!Array.isArray(raw)) return []
  const valid: Ninja[] = []
  let dropped = 0
  for (const item of raw) {
    if (validateNinjaRecord(item)) {
      valid.push(item as Ninja)
    } else {
      dropped += 1
    }
  }
  if (dropped > 0) {
    console.warn(`[ninjaStore] 忍者池中 ${dropped} 条损坏数据已丢弃`)
  }
  // 全部损坏时回退内置示例池，避免空池卡死 BP 流程
  if (valid.length === 0 && raw.length > 0) {
    console.warn('[ninjaStore] 忍者池数据全部损坏，已回退为内置示例池')
    return NINJA_POOL.map((n) => ({ ...n }))
  }
  return valid
}

interface NinjaStore {
  ninjas: Ninja[]
  /** 当前池来源（dataPackStore 维护；手工变更自动降级为 CUSTOM） */
  poolSource: NinjaPoolSource
  /** 激活的数据包 ID（'ninja-bp-default' | 包 id | 'CUSTOM'） */
  activePackId: string
  addNinja: (input: Omit<Ninja, 'id'> & { id?: string }) => string
  updateNinja: (id: string, patch: Partial<Ninja>) => void
  removeNinja: (id: string) => void
  toggleEnabled: (id: string) => void
  setEnabled: (ids: string[], enabled: boolean) => void
  removeMany: (ids: string[]) => void
  importNinjas: (incoming: Ninja[], mode: 'merge' | 'replace') => { added: number; updated: number }
  replaceAll: (ninjas: Ninja[]) => void
  resetToDefault: () => void
  getById: (id: string) => Ninja | undefined
  nameOf: (id: string) => string

  // ---- v0.4 数据包接口（仅 dataPackStore 调用）----
  /** 应用数据包内容为当前生效池（来源标记为包） */
  applyPackPool: (ninjas: Ninja[], source: NinjaPoolSource, packId: string) => void
  /** 仅更新来源标记（切回 CUSTOM 且池内容不变时使用） */
  setPoolSource: (source: NinjaPoolSource, packId: string) => void
}

function persist(ninjas: Ninja[]) {
  saveJSON(STORAGE_KEYS.ninjaPool, ninjas)
}

function genId(): string {
  return `nid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 手工变更后把来源降级为 CUSTOM（dataPackStore 在运行时注入，避免模块循环依赖） */
let onPoolManuallyMutated: (() => void) | null = null
export function setPoolMutationHook(hook: () => void): void {
  onPoolManuallyMutated = hook
}
function markManuallyMutated(): void {
  onPoolManuallyMutated?.()
}

export const useNinjaStore = create<NinjaStore>()((set, get) => ({
  // 启动时加载：逐条运行时校验，损坏数据安全回退
  ninjas: sanitizePool(loadJSON<unknown>(STORAGE_KEYS.ninjaPool, NINJA_POOL)),
  poolSource: 'BUILT_IN',
  activePackId: 'ninja-bp-default',

  addNinja: (input) => {
    const id = input.id?.trim() || genId()
    const ninja: Ninja = { ...input, id, name: input.name.trim() }
    set({ ninjas: [...get().ninjas, ninja] })
    persist(get().ninjas)
    markManuallyMutated()
    return id
  },

  updateNinja: (id, patch) => {
    set({ ninjas: get().ninjas.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
    persist(get().ninjas)
    markManuallyMutated()
  },

  removeNinja: (id) => {
    set({ ninjas: get().ninjas.filter((n) => n.id !== id) })
    persist(get().ninjas)
    markManuallyMutated()
  },

  toggleEnabled: (id) => {
    set({ ninjas: get().ninjas.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)) })
    persist(get().ninjas)
    markManuallyMutated()
  },

  setEnabled: (ids, enabled) => {
    const idSet = new Set(ids)
    set({ ninjas: get().ninjas.map((n) => (idSet.has(n.id) ? { ...n, enabled } : n)) })
    persist(get().ninjas)
    markManuallyMutated()
  },

  removeMany: (ids) => {
    const idSet = new Set(ids)
    set({ ninjas: get().ninjas.filter((n) => !idSet.has(n.id)) })
    persist(get().ninjas)
    markManuallyMutated()
  },

  importNinjas: (incoming, mode) => {
    let pool: Ninja[]
    let added: number
    let updated: number
    if (mode === 'replace') {
      pool = [...incoming]
      added = incoming.length
      updated = 0
    } else {
      const result = mergeNinjas(get().ninjas, incoming)
      pool = result.pool
      added = result.added
      updated = result.updated
    }
    set({ ninjas: pool })
    persist(pool)
    markManuallyMutated()
    return { added, updated }
  },

  replaceAll: (ninjas) => {
    set({ ninjas })
    persist(ninjas)
    markManuallyMutated()
  },

  resetToDefault: () => {
    set({ ninjas: NINJA_POOL.map((n) => ({ ...n })) })
    persist(get().ninjas)
  },

  getById: (id) => get().ninjas.find((n) => n.id === id),

  nameOf: (id) => get().ninjas.find((n) => n.id === id)?.name ?? '未知忍者',

  applyPackPool: (ninjas, source, packId) => {
    set({ ninjas, poolSource: source, activePackId: packId })
    persist(ninjas)
  },

  setPoolSource: (source, packId) => {
    set({ poolSource: source, activePackId: packId })
  },
}))
