import { create } from 'zustand'
import type { Side } from '@/types/bp'
import type { MatchState } from '@/types/match'
import {
  createMatch,
  enterGame,
  nextGame,
  resetCurrentGame,
  selectNinja,
  setGameWinner,
  startMatch,
} from '@/engine/bpEngine'
import { emptyStacks, recordSnapshot, redo, undo, type UndoStacks } from '@/engine/historyEngine'
import { validateMatchState } from '@/engine/matchValidator'
import { useNinjaStore } from './ninjaStore'
import { useSettingsStore } from './settingsStore'
import { playSound } from '@/utils/sound'
import { loadJSON, removeKey, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { toast } from './toastStore'

/**
 * BP 比赛 Store：引擎的 React 绑定层。
 *
 * 撤销/重做在这里完成：每次变更前把完整 MatchState 压入快照栈，
 * 撤销 = 弹出快照整体恢复，因此阶段、比分、Ban/Pick、可用性永远一致。
 * 进行中的比赛每次变更都会写入 localStorage（current_match），
 * 刷新页面后可以恢复到当前步骤。
 */

const MAX_RECENT = 20

interface OpResult {
  ok: boolean
  reason?: string
}

/** 从本地数组中筛出合法比赛，丢弃损坏条目并给出警告 */
function sanitizeMatchList(raw: unknown, source: string): MatchState[] {
  if (!Array.isArray(raw)) return []
  const valid: MatchState[] = []
  for (const item of raw) {
    if (validateMatchState(item)) {
      valid.push(item as MatchState)
    } else {
      console.warn(`[bpStore] ${source} 中存在损坏的比赛记录，已丢弃`)
    }
  }
  return valid
}

interface BPStore {
  match: MatchState | null
  stacks: UndoStacks
  recentMatches: MatchState[]

  /** 新建并开始比赛（首页「开始 BP」） */
  startNewMatch: (bluePlayerName?: string, redPlayerName?: string) => MatchState
  /** 继续历史中的未完成比赛 */
  continueMatch: (id: string) => MatchState | null
  selectNinja: (ninjaId: string) => OpResult
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  enterGame: () => OpResult
  setGameWinner: (side: Side) => OpResult
  nextGame: () => OpResult
  resetCurrentGame: () => OpResult
  /** 重置比赛：相同规则与选手，开始全新一场 */
  resetMatch: () => void
  deleteRecent: (id: string) => void
  clearCurrent: () => void
  /** 恢复备份：整体替换当前比赛与历史（数据已在上层校验） */
  restoreBackup: (currentMatch: MatchState | null, recentMatches: MatchState[]) => void
  /** 在线比赛结束后保存到本地历史（按 id 去重，不覆盖当前比赛） */
  saveExternalMatch: (match: MatchState) => void
}

/** 应用一次引擎变更：压快照 → 更新状态 → 持久化（含最近比赛列表） */
function commit(next: MatchState) {
  const { match, stacks } = useBPStore.getState()
  if (!match) return
  const newStacks = recordSnapshot(stacks, match)
  useBPStore.setState({ match: next, stacks: newStacks })
  persistMatch(next)
}

function persistMatch(match: MatchState) {
  saveJSON(STORAGE_KEYS.currentMatch, match)
  const recent = [match, ...useBPStore.getState().recentMatches.filter((m) => m.id !== match.id)].slice(0, MAX_RECENT)
  useBPStore.setState({ recentMatches: recent })
  saveJSON(STORAGE_KEYS.recentMatches, recent)
}

export const useBPStore = create<BPStore>()((set, get) => ({
  // 启动即恢复最近一场比赛：严格校验，损坏数据整体回退为 null
  match: loadJSON<MatchState | null>(STORAGE_KEYS.currentMatch, null, (v) => validateMatchState(v)),
  stacks: emptyStacks(),
  recentMatches: sanitizeMatchList(loadJSON<unknown>(STORAGE_KEYS.recentMatches, []), 'recent_matches'),

  startNewMatch: (bluePlayerName, redPlayerName) => {
    const rule = useSettingsStore.getState().activeRule()
    const match = startMatch(createMatch(rule, bluePlayerName, redPlayerName))
    set({ match, stacks: emptyStacks() })
    persistMatch(match)
    return match
  },

  continueMatch: (id) => {
    const found = get().recentMatches.find((m) => m.id === id)
    if (!found) return null
    set({ match: found, stacks: emptyStacks() })
    saveJSON(STORAGE_KEYS.currentMatch, found)
    return found
  },

  selectNinja: (ninjaId) => {
    const match = get().match
    if (!match) return { ok: false, reason: '没有进行中的比赛' }
    const ninja = useNinjaStore.getState().getById(ninjaId)
    const result = selectNinja(match, ninjaId, ninja)
    if (!result.ok || !result.state) return { ok: false, reason: result.reason }
    commit(result.state)
    const lastAction = result.state.history[result.state.history.length - 1]
    playSound(lastAction?.action === 'BAN' ? 'ban' : 'select', useSettingsStore.getState().settings.soundEnabled)
    return { ok: true }
  },

  undo: () => {
    const match = get().match
    if (!match) return false
    const result = undo(match, get().stacks)
    if (!result.ok || !result.state) {
      if (result.reason) toast(result.reason)
      return false
    }
    set({ match: result.state, stacks: result.stacks })
    persistMatch(result.state)
    return true
  },

  redo: () => {
    const match = get().match
    if (!match) return false
    const result = redo(match, get().stacks)
    if (!result.ok || !result.state) {
      if (result.reason) toast(result.reason)
      return false
    }
    set({ match: result.state, stacks: result.stacks })
    persistMatch(result.state)
    return true
  },

  canUndo: () => get().stacks.past.length > 0,
  canRedo: () => get().stacks.future.length > 0,

  enterGame: () => {
    const match = get().match
    if (!match) return { ok: false, reason: '没有进行中的比赛' }
    const result = enterGame(match)
    if (!result.ok || !result.state) return { ok: false, reason: result.reason }
    commit(result.state)
    return { ok: true }
  },

  setGameWinner: (side) => {
    const match = get().match
    if (!match) return { ok: false, reason: '没有进行中的比赛' }
    const result = setGameWinner(match, side)
    if (!result.ok || !result.state) return { ok: false, reason: result.reason }
    commit(result.state)
    playSound('win', useSettingsStore.getState().settings.soundEnabled)
    return { ok: true }
  },

  nextGame: () => {
    const match = get().match
    if (!match) return { ok: false, reason: '没有进行中的比赛' }
    const result = nextGame(match)
    if (!result.ok || !result.state) return { ok: false, reason: result.reason }
    commit(result.state)
    return { ok: true }
  },

  resetCurrentGame: () => {
    const match = get().match
    if (!match) return { ok: false, reason: '没有进行中的比赛' }
    const result = resetCurrentGame(match)
    if (!result.ok || !result.state) return { ok: false, reason: result.reason }
    commit(result.state)
    return { ok: true }
  },

  resetMatch: () => {
    const match = get().match
    if (!match) return
    get().startNewMatch(match.bluePlayerName, match.redPlayerName)
  },

  deleteRecent: (id) => {
    const recent = get().recentMatches.filter((m) => m.id !== id)
    set({ recentMatches: recent })
    saveJSON(STORAGE_KEYS.recentMatches, recent)
    if (get().match?.id === id) {
      set({ match: null })
      removeKey(STORAGE_KEYS.currentMatch)
    }
  },

  clearCurrent: () => {
    set({ match: null })
    removeKey(STORAGE_KEYS.currentMatch)
  },

  restoreBackup: (currentMatch, recentMatches) => {
    const nextRecent = recentMatches.slice(0, MAX_RECENT)
    set({ match: currentMatch, stacks: emptyStacks(), recentMatches: nextRecent })
    if (currentMatch) saveJSON(STORAGE_KEYS.currentMatch, currentMatch)
    else removeKey(STORAGE_KEYS.currentMatch)
    saveJSON(STORAGE_KEYS.recentMatches, nextRecent)
  },

  saveExternalMatch: (match) => {
    if (!validateMatchState(match)) {
      toast('该比赛数据未通过校验，无法保存', 'error')
      return
    }
    const recent = [match, ...get().recentMatches.filter((m) => m.id !== match.id)].slice(0, MAX_RECENT)
    set({ recentMatches: recent })
    saveJSON(STORAGE_KEYS.recentMatches, recent)
  },
}))
