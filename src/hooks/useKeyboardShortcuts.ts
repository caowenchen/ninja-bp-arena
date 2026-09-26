import { useEffect } from 'react'

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** Global search and local draft shortcuts; text fields retain native editing shortcuts. */
export function useKeyboardShortcuts(options: { onEscape?: () => void; onUndo?: () => void; onRedo?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === '/' || e.code === 'Slash') && !isTypingTarget(e.target) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-resource-search]')?.focus()
        return
      }
      if (e.key === 'Escape') {
        options.onEscape?.()
        if (isTypingTarget(e.target)) (e.target as HTMLElement).blur()
        return
      }
      if (!e.ctrlKey && !e.metaKey) return
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey && options.onUndo) {
        e.preventDefault()
        options.onUndo()
      } else if ((key === 'y' || (key === 'z' && e.shiftKey)) && options.onRedo) {
        e.preventDefault()
        options.onRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options])
}
