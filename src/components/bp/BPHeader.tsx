import { Link } from 'react-router-dom'
import { History, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import type { MatchState } from '@/types/match'
import { useBPStore } from '@/store/bpStore'
import { ScoreBoard } from '@/components/match/ScoreBoard'

interface BPHeaderProps {
  match: MatchState
  onOpenHistory: () => void
  onOpenReset: () => void
}

/** BP 页顶栏：品牌 + 比分 + 快捷操作 */
export function BPHeader({ match, onOpenHistory, onOpenReset }: BPHeaderProps) {
  const undo = useBPStore((s) => s.undo)
  const redo = useBPStore((s) => s.redo)
  const canUndo = useBPStore((s) => s.canUndo())
  const canRedo = useBPStore((s) => s.canRedo())

  const iconBtn =
    'rounded-lg border border-ink-500 p-2 text-fog-300 transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-35'

  return (
    <header className="border-b border-ink-600 bg-ink-900/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-3 py-2.5 lg:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="返回首页">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-side-blue/30 to-ink-800 text-sm font-bold text-side-blue-soft ring-1 ring-side-blue/40">
            忍
          </span>
          <span className="hidden text-sm font-bold tracking-wide text-fog-100 sm:block">忍界 BP</span>
        </Link>

        <ScoreBoard match={match} />

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onOpenHistory} className={iconBtn} aria-label="历史记录" title="历史记录">
            <History size={16} />
          </button>
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            className={`${iconBtn} hidden sm:block`}
            aria-label="撤销（Ctrl+Z）"
            title="撤销（Ctrl+Z）"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            className={`${iconBtn} hidden sm:block`}
            aria-label="重做（Ctrl+Y）"
            title="重做（Ctrl+Y）"
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            onClick={onOpenReset}
            className={iconBtn}
            aria-label="重置比赛"
            title="重置比赛"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
