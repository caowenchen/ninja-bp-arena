import type { ReactNode } from 'react'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** 二次确认弹窗：重置比赛 / 删除忍者 / 记录胜负等危险操作 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-fog-300 transition-colors hover:bg-ink-600">
            取消
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-side-red hover:bg-side-red/85' : 'bg-side-blue hover:bg-side-blue/85'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-fog-300">{message}</p>
    </Dialog>
  )
}
