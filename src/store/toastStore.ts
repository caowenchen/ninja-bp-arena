import { create } from 'zustand'

/** 轻量 Toast：非法操作提示、复制成功提示等 */
export type ToastType = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  type: ToastType
  text: string
}

interface ToastStore {
  toasts: ToastItem[]
  push: (text: string, type?: ToastType) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (text, type = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts.slice(-3), { id, type, text }] })
    window.setTimeout(() => get().dismiss(id), 2600)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

/** 组件外的便捷调用 */
export const toast = (text: string, type?: ToastType) => useToastStore.getState().push(text, type)
