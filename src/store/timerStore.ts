import { create } from 'zustand'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'
import { validateTimerState } from '@/engine/matchValidator'

/**
 * BP 倒计时运行时。
 *
 * 倒计时不能再靠组件里的 useState + setInterval：
 * 刷新页面会把剩余时间重置回满额，这对赛事 BP 工具不合理。
 * 这里持久化「阶段标识 + 截止时间戳」，剩余时间永远由
 * deadlineAt - now 推导：
 * - 刷新后恢复真实剩余时间，已过期的直接进入 TIMEOUT
 * - 同一序列步骤（如红方连续选 2 人）共享同一个 deadline，不因单次选择重置
 * - phaseKey 变化（进入新步骤 / 撤销回退 / 换局）才生成新 deadline，
 *   因此撤销后计时器永远对应当前阶段，不会残留上一阶段的时间
 */

export interface TimerSnapshot {
  phaseKey: string | null
  deadlineAt: number | null
}

interface TimerStore extends TimerSnapshot {
  /**
   * 同步阶段：phaseKey 未变化时保留原 deadline（刷新恢复 / 同步骤连续选择）；
   * 变化时生成新的 deadline。
   */
  sync: (args: { phaseKey: string; seconds: number; enabled: boolean }) => void
  /** 「重新计时」：立即重建当前阶段的 deadline */
  restart: (seconds: number) => void
  clear: () => void
}

const TIMER_VALIDATE = (v: unknown) => validateTimerState(v)

function persist(state: TimerSnapshot) {
  saveJSON(STORAGE_KEYS.bpTimer, state)
}

export const useTimerStore = create<TimerStore>()((set, get) => ({
  // 启动时读取上次会话的 { phaseKey, deadlineAt }；由 sync() 决定沿用或重建
  ...loadJSON<TimerSnapshot>(STORAGE_KEYS.bpTimer, { phaseKey: null, deadlineAt: null }, TIMER_VALIDATE),

  sync: ({ phaseKey, seconds, enabled }) => {
    const current = get()
    if (!enabled) {
      if (current.phaseKey !== phaseKey || current.deadlineAt !== null) {
        const next = { phaseKey, deadlineAt: null }
        set(next)
        persist(next)
      }
      return
    }
    const unchanged = current.phaseKey === phaseKey && typeof current.deadlineAt === 'number'
    if (unchanged) return
    const next: TimerSnapshot = { phaseKey, deadlineAt: Date.now() + seconds * 1000 }
    set(next)
    persist(next)
  },

  restart: (seconds) => {
    const current = get()
    if (!current.phaseKey) return
    const next: TimerSnapshot = { phaseKey: current.phaseKey, deadlineAt: Date.now() + seconds * 1000 }
    set(next)
    persist(next)
  },

  clear: () => {
    const next: TimerSnapshot = { phaseKey: null, deadlineAt: null }
    set(next)
    persist(next)
  },
}))
