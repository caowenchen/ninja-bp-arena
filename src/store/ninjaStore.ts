import { create } from 'zustand'
import type { Ninja } from '@/types/ninja'
import { NINJA_POOL } from '@/data/ninjas'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { mergeNinjas } from '@/utils/importExport'

/**
 * 忍者池 Store：增删改查 + 启用/禁用 + JSON 导入合并。
 * 每次变更立即持久化到 localStorage（ninja_pool）。
 */

function isNinjaArray(value: unknown): boolean {
  return Array.isArray(value)
}

interface NinjaStore {
  ninjas: Ninja[]
  addNinja: (input: Omit<Ninja, 'id'> & { id?: string }) => string
  updateNinja: (id: string, patch: Partial<Ninja>) => void
  removeNinja: (id: string) => void
  toggleEnabled: (id: string) => void
  importNinjas: (incoming: Ninja[]) => { added: number; updated: number }
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
  // 启动时加载；损坏数据回退为内置示例池（loadJSON 已兜底）
  ninjas: loadJSON<Ninja[]>(STORAGE_KEYS.ninjaPool, NINJA_POOL, isNinjaArray),

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

  importNinjas: (incoming) => {
    const { pool, added, updated } = mergeNinjas(get().ninjas, incoming)
    set({ ninjas: pool })
    persist(pool)
    return { added, updated }
  },

  resetToDefault: () => {
    set({ ninjas: NINJA_POOL.map((n) => ({ ...n })) })
    persist(get().ninjas)
  },

  getById: (id) => get().ninjas.find((n) => n.id === id),

  nameOf: (id) => get().ninjas.find((n) => n.id === id)?.name ?? '未知忍者',
}))
