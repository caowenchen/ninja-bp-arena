import type { MatchState } from '@/types/match'
import { SIDE_TEXT } from '@/types/bp'
import { useMatchSource } from '@/matchSource/context'
import { Dialog } from '@/components/common/Dialog'
import { useResourceLookup } from '@/hooks/useNinjaLookup'

interface GameResultDialogProps {
  match: MatchState
  open: boolean
  onClose: () => void
}

/** 本局结果弹窗：记录胜负后出现，进入下一局或撤销判定 */
export function GameResultDialog({ match, open, onClose }: GameResultDialogProps) {
  const game = match.games[match.games.length - 1]
  const winner = game.winner
  const source = useMatchSource()
  const resourceNameOf = useResourceLookup(match)

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
        {(game.blue.resources || game.red.resources) && (
          <div className="w-full rounded border border-ink-600 bg-ink-900/50 p-3 text-xs text-fog-300">
            {(['BLUE', 'RED'] as const).map((side) => {
              const player = side === 'BLUE' ? game.blue : game.red
              return (
                <div key={side} className="mb-1 last:mb-0">
                  <p>{side === 'BLUE' ? '蓝方' : '红方'}秘卷：{(player.resources?.SECRET_SCROLL?.picks ?? []).map((id) => resourceNameOf('SECRET_SCROLL', id)).join('、') || '无'}</p>
                  <p>{side === 'BLUE' ? '蓝方' : '红方'}通灵：{(player.resources?.SUMMON?.picks ?? []).map((id) => resourceNameOf('SUMMON', id)).join('、') || '无'}</p>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex w-full flex-col gap-2 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              void Promise.resolve(source.nextGame()).then((result) => {
                if (!result.ok && result.reason) return
                onClose()
              })
            }}
            className="flex-1 rounded-lg bg-side-blue px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-side-blue/85"
          >
            进入 Game {game.gameNumber + 1}
          </button>
          <button
            type="button"
            onClick={() => {
              void Promise.resolve(source.undo()).then(() => onClose())
            }}
            className="flex-1 rounded-lg border border-ink-500 px-4 py-2.5 text-sm text-fog-300 transition-colors hover:bg-ink-600"
          >
            {source.mode === 'online' ? '请求撤销判定' : '撤销判定'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
