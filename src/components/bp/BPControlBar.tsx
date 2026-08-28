import { Link } from 'react-router-dom'
import { History, Redo2, Settings, Undo2 } from 'lucide-react'
import type { MatchState } from '@/types/match'
import { getPhase } from '@/engine/bpEngine'
import { useBPStore } from '@/store/bpStore'
import { SIDE_TEXT } from '@/types/bp'

interface BPControlBarProps {
  match: MatchState
  onOpenHistory: () => void
}

/** 底部操作栏：桌面为页尾操作区，移动端为 sticky 底栏（页面预留 padding） */
export function BPControlBar({ match, onOpenHistory }: BPControlBarProps) {
  const undo = useBPStore((s) => s.undo)
  const redo = useBPStore((s) => s.redo)
  const canUndo = useBPStore((s) => s.canUndo())
  const canRedo = useBPStore((s) => s.canRedo())
  const phase = getPhase(match)

  const phaseHint =
    phase.status === 'BANNING' || phase.status === 'PICKING'
      ? `${SIDE_TEXT[phase.side!]}${phase.action === 'BAN' ? '禁用' : '选择'}中`
      : phase.status === 'READY'
        ? '阵容已锁定'
        : phase.status === 'PLAYING'
          ? '比赛进行中'
          : '已记录胜负'

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600 bg-ink-900/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-2 lg:px-6">
        {/* 移动端阶段提示 */}
        <span className={`truncate text-xs font-medium lg:hidden ${phase.status === 'BANNING' ? 'text-side-red-soft' : phase.status === 'PICKING' ? 'text-side-blue-soft' : 'text-fog-500'}`}>
          {phaseHint}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600"
          >
            <History size={14} /> <span className="hidden sm:inline">历史记录</span>
          </button>
          <button
            type="button"
            onClick={() => undo()}
            disabled={!canUndo}
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2 size={14} /> 撤销
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={!canRedo}
            className="hidden items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-35 sm:flex"
          >
            <Redo2 size={14} /> 重做
          </button>
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600"
          >
            <Settings size={14} /> <span className="hidden sm:inline">设置</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
