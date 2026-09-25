import { create } from 'zustand'
import {
  createReplayBundle,
  createReplayFromMatch,
  migrateReplayToCurrentSchema,
  REPLAY_IMPORT_MAX_BYTES,
  validateReplay,
  validateReplayBundle,
  type BPReplay,
  type ReplaySource,
} from '@bp-core'
import type { MatchState } from '@/types/match'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { toast } from '@/store/toastStore'

export interface ReplayShareRecord {
  replayId: string
  token: string
  url: string
  createdAt: number
  anonymized: boolean
  status: 'ACTIVE' | 'REVOKED'
}

interface PersistedReplayLibrary {
  replays: BPReplay[]
  shares: ReplayShareRecord[]
}

interface ReplayLibraryStore extends PersistedReplayLibrary {
  list: () => BPReplay[]
  get: (id: string) => BPReplay | undefined
  save: (replay: BPReplay) => boolean
  saveFromMatch: (match: MatchState, source?: ReplaySource, roomId?: string) => BPReplay | null
  delete: (id: string) => void
  importText: (text: string) => { ok: true; replay: BPReplay } | { ok: false; error: string }
  exportBundle: (id: string) => ReturnType<typeof createReplayBundle> | null
  rememberShare: (share: ReplayShareRecord) => void
  markShareRevoked: (token: string) => void
}

const MAX_REPLAYS = 100

function loadLibrary(): PersistedReplayLibrary {
  const raw = loadJSON<unknown>(STORAGE_KEYS.replayLibrary, { replays: [], shares: [] }, undefined, (legacy) => (
    Array.isArray(legacy) ? { replays: legacy, shares: [] } : legacy
  ))
  if (!raw || typeof raw !== 'object') return { replays: [], shares: [] }
  const data = raw as Partial<PersistedReplayLibrary>
  const replays = Array.isArray(data.replays) ? data.replays.filter((item) => validateReplay(item).ok) : []
  const shares = Array.isArray(data.shares) ? data.shares.filter((item) => (
    item && typeof item.replayId === 'string' && typeof item.token === 'string' && typeof item.url === 'string' &&
    typeof item.createdAt === 'number' && typeof item.anonymized === 'boolean' && (item.status === 'ACTIVE' || item.status === 'REVOKED')
  )) : []
  return { replays, shares }
}

function persist(data: PersistedReplayLibrary): boolean {
  const result = saveJSON(STORAGE_KEYS.replayLibrary, data)
  if (result === 'quota') toast('本地存储空间不足，复盘未保存；请先导出或删除旧复盘', 'error')
  else if (result === 'error') toast('复盘保存失败，本地比赛记录未受影响', 'error')
  return result === 'ok'
}

const initial = loadLibrary()

export const useReplayStore = create<ReplayLibraryStore>()((set, get) => ({
  ...initial,
  list: () => [...get().replays].sort((a, b) => b.completedAt - a.completedAt),
  get: (id) => get().replays.find((item) => item.replayId === id || item.metadata.matchId === id),
  save: (replay) => {
    const validation = validateReplay(replay)
    if (!validation.ok) {
      toast(`复盘未通过校验：${validation.errors[0]}`, 'error')
      return false
    }
    const next = [structuredClone(replay), ...get().replays.filter((item) => item.replayId !== replay.replayId)].slice(0, MAX_REPLAYS)
    if (!persist({ replays: next, shares: get().shares })) return false
    set({ replays: next })
    return true
  },
  saveFromMatch: (match, source = 'LOCAL', roomId) => {
    try {
      const existing = get().get(match.id)
      if (existing) {
        if (roomId && !existing.metadata.roomId) {
          const updated = { ...existing, source, metadata: { ...existing.metadata, roomId } }
          return get().save(updated) ? updated : null
        }
        if (existing.completedAt === match.updatedAt) return existing
      }
      const replay = createReplayFromMatch(match, source, roomId ? { roomId } : {})
      return get().save(replay) ? replay : null
    } catch (error) {
      toast(error instanceof Error ? error.message : '无法生成复盘', 'error')
      return null
    }
  },
  delete: (id) => {
    const replays = get().replays.filter((item) => item.replayId !== id)
    if (persist({ replays, shares: get().shares })) set({ replays })
  },
  importText: (text) => {
    if (new TextEncoder().encode(text).byteLength > REPLAY_IMPORT_MAX_BYTES) return { ok: false, error: '文件超过 2 MB 限制' }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return { ok: false, error: 'JSON 格式无效' } }
    const bundleValidation = validateReplayBundle(parsed)
    if (!bundleValidation.ok) return { ok: false, error: bundleValidation.errors.join('；') }
    const migrated = migrateReplayToCurrentSchema(parsed)
    if (!migrated.ok) return migrated
    const original = migrated.replay
    const replay: BPReplay = {
      ...original,
      replayId: `imported-${original.replayId}-${Date.now().toString(36)}`,
      source: 'IMPORTED',
      metadata: { ...original.metadata, originalSource: original.source },
    }
    if (!get().save(replay)) return { ok: false, error: '本地存储空间不足或复盘无效' }
    return { ok: true, replay }
  },
  exportBundle: (id) => {
    const replay = get().get(id)
    return replay ? createReplayBundle(replay) : null
  },
  rememberShare: (share) => {
    const shares = [share, ...get().shares.filter((item) => item.token !== share.token)]
    if (persist({ replays: get().replays, shares })) set({ shares })
  },
  markShareRevoked: (token) => {
    const shares = get().shares.map((item) => item.token === token ? { ...item, status: 'REVOKED' as const } : item)
    if (persist({ replays: get().replays, shares })) set({ shares })
  },
}))

export function downloadReplay(replay: BPReplay): void {
  const blob = new Blob([JSON.stringify(createReplayBundle(replay), null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `ninja-bp-replay-${replay.replayId.replace(/[^a-z0-9_-]/gi, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
