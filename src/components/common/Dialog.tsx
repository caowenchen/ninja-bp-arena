import { useEffect, useRef, type ReactNode } from 'react'
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

/** 通用模态框：Esc 关闭、点击遮罩关闭、打开时移入焦点 / 关闭后归还焦点 */
export function Dialog({ open, onClose, title, children, footer, wide }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 合理焦点管理：记录并移入焦点，关闭时归还
    previousFocusRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      previousFocusRef.current?.focus?.()
    }
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
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg border border-border-strong bg-surface-1 shadow-2xl shadow-black/60 outline-none`}
      >
        <div className="flex items-center justify-between border-b border-border-muted px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-wide text-fog-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded p-1.5 text-fog-500 transition-colors hover:bg-surface-2 hover:text-fog-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border-muted px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}
