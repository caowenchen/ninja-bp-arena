import type { MatchState } from '@/types/match'
import { useBPStore } from '@/store/bpStore'
import { getPhase } from '@/engine/bpEngine'
import { SIDE_TEXT } from '@/types/bp'

interface BPControlBarProps {
  match: MatchState
  onOpenHistory: () => void
}

/** 底部操作栏：移动端 sticky（含 safe-area），桌面为页尾操作区 */
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

  const btn =
    'rounded border border-border-muted px-2.5 py-1.5 text-xs text-fog-300 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-35'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-muted bg-ink-900/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-2.5 py-1.5 lg:px-5">
        <span
          className={`truncate text-xs font-medium lg:hidden ${
            phase.status === 'BANNING'
              ? 'text-red-team-soft'
              : phase.status === 'PICKING'
                ? 'text-blue-team-soft'
                : 'text-fog-500'
          }`}
        >
          {phaseHint}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onOpenHistory} className={btn}>
            历史
          </button>
          <button type="button" onClick={() => undo()} disabled={!canUndo} className={btn}>
            撤销
          </button>
          <button type="button" onClick={() => redo()} disabled={!canRedo} className={btn}>
            重做
          </button>
        </div>
      </div>
    </div>
  )
}
