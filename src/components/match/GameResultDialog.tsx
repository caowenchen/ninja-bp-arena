import type { MatchState } from '@/types/match'
import { SIDE_TEXT } from '@/types/bp'
import { useBPStore } from '@/store/bpStore'
import { Dialog } from '@/components/common/Dialog'

interface GameResultDialogProps {
  match: MatchState
  open: boolean
  onClose: () => void
}

/** 本局结果弹窗：记录胜负后出现，进入下一局或撤销判定 */
export function GameResultDialog({ match, open, onClose }: GameResultDialogProps) {
  const game = match.games[match.games.length - 1]
  const winner = game.winner
  const nextGame = useBPStore((s) => s.nextGame)
  const undo = useBPStore((s) => s.undo)

  if (!winner) return null

  const isBlue = winner === 'BLUE'

  return (
    <Dialog open={open} onClose={onClose} title={`GAME ${game.gameNumber} RESULT`}>
      <div className="flex flex-col items-center gap-4 py-2">
        <span className={`text-2xl font-black ${isBlue ? 'text-side-blue-soft' : 'text-side-red-soft'}`}>
          {SIDE_TEXT[winner]}获胜
        </span>
        <span className="text-3xl font-bold tabular-nums tracking-widest text-fog-100">
          {match.score.blue} <span className="text-fog-600">:</span> {match.score.red}
        </span>
        <p className="text-xs text-fog-500">
          已使用的忍者将在后续小局中保持禁用；首局 Ban 全场有效。
        </p>
        <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              const result = nextGame()
              if (result.ok) onClose()
            }}
            className="flex-1 rounded-lg bg-side-blue px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-side-blue/85"
          >
            进入 Game {game.gameNumber + 1}
          </button>
          <button
            type="button"
            onClick={() => {
              undo()
              onClose()
            }}
            className="flex-1 rounded-lg border border-ink-500 px-4 py-2.5 text-sm text-fog-300 transition-colors hover:bg-ink-600"
          >
            撤销判定
          </button>
        </div>
      </div>
    </Dialog>
  )
}
