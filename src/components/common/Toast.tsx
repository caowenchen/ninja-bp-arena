import { useToastStore } from '@/store/toastStore'

/** 全局 Toast 宿主：非法操作 / 复制成功等轻提示 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-lg shadow-black/40 backdrop-blur transition-all ${
            t.type === 'error'
              ? 'border-side-red/40 bg-side-red/15 text-side-red-soft'
              : t.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-ink-500 bg-ink-800/95 text-fog-100'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
