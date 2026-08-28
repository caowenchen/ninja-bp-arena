import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 危险操作样式（红色确认按钮场景由调用方自行渲染 footer） */
  wide?: boolean
}

/** 通用模态框：Esc 关闭、点击遮罩关闭、真正的 dialog 语义结构 */
export function Dialog({ open, onClose, title, children, footer, wide }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-ink-500 bg-ink-800 shadow-2xl shadow-black/60`}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-wide text-fog-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1.5 text-fog-500 transition-colors hover:bg-ink-600 hover:text-fog-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-600 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}
