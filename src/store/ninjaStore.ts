import { create } from 'zustand'
import type { Ninja } from '@/types/ninja'
import { NINJA_POOL } from '@/data/ninjas'
import { validateNinjaRecord } from '@/engine/matchValidator'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { mergeNinjas } from '@/utils/importExport'

/**
 * 忍者池 Store：增删改查 + 启用/禁用 + JSON 导入合并 + 批量操作。
 * 每次变更立即持久化到 localStorage（ninja_pool）。
 * 加载时逐条校验，损坏条目丢弃并警告，全部损坏则回退内置示例池。
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
}

function persist(ninjas: Ninja[]) {
  saveJSON(STORAGE_KEYS.ninjaPool, ninjas)
}

function genId(): string {
  return `nid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useNinjaStore = create<NinjaStore>()((set, get) => ({
  // 启动时加载：逐条运行时校验，损坏数据安全回退
  ninjas: sanitizePool(loadJSON<unknown>(STORAGE_KEYS.ninjaPool, NINJA_POOL)),

  addNinja: (input) => {
    const id = input.id?.trim() || genId()
    const ninja: Ninja = { ...input, id, name: input.name.trim() }
    set({ ninjas: [...get().ninjas, ninja] })
    persist(get().ninjas)
    return id
  },

  updateNinja: (id, patch) => {
    set({ ninjas: get().ninjas.map((n) => (n.id === id ? { ...n, ...patch } : n)) })
    persist(get().ninjas)
  },

  removeNinja: (id) => {
    set({ ninjas: get().ninjas.filter((n) => n.id !== id) })
    persist(get().ninjas)
  },

  toggleEnabled: (id) => {
    set({ ninjas: get().ninjas.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)) })
    persist(get().ninjas)
  },

  setEnabled: (ids, enabled) => {
    const idSet = new Set(ids)
    set({ ninjas: get().ninjas.map((n) => (idSet.has(n.id) ? { ...n, enabled } : n)) })
    persist(get().ninjas)
  },

  removeMany: (ids) => {
    const idSet = new Set(ids)
    set({ ninjas: get().ninjas.filter((n) => !idSet.has(n.id)) })
    persist(get().ninjas)
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
    return { added, updated }
  },

  replaceAll: (ninjas) => {
    set({ ninjas })
    persist(ninjas)
  },

  resetToDefault: () => {
    set({ ninjas: NINJA_POOL.map((n) => ({ ...n })) })
    persist(get().ninjas)
  },

  getById: (id) => get().ninjas.find((n) => n.id === id),

  nameOf: (id) => get().ninjas.find((n) => n.id === id)?.name ?? '未知忍者',
}))
