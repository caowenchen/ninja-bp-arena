import { Swords } from 'lucide-react'
import type { Side } from '@/types/bp'
import type { MatchState } from '@/types/match'
import { useBPStore } from '@/store/bpStore'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'
import { useNinjaStore } from '@/store/ninjaStore'

interface ReadyStageProps {
  match: MatchState
}

/** GAME READY：中央 VS 阵容展示 + 进入比赛 / 返回修改（= 撤销） */
export function ReadyStage({ match }: ReadyStageProps) {
  const enterGame = useBPStore((s) => s.enterGame)
  const undo = useBPStore((s) => s.undo)
  const canUndo = useBPStore((s) => s.canUndo())
  const game = match.games[match.games.length - 1]
  const ninjaById = useNinjaStore((s) => s.getById)

  const renderSide = (side: Side) => {
    const player = side === 'BLUE' ? game.blue : game.red
    const color = side === 'BLUE' ? 'text-side-blue-soft' : 'text-side-red-soft'
    return (
      <div className="flex flex-1 flex-col items-center gap-2">
        <span className={`text-xs font-bold tracking-widest ${color}`}>{side === 'BLUE' ? 'BLUE' : 'RED'}</span>
        <div className="flex justify-center gap-2">
          {player.picks.map((id, i) => {
            const ninja = ninjaById(id)
            return (
              <div key={id} className="flex flex-col items-center gap-1">
                <NinjaAvatar
                  name={ninja?.name ?? '?'}
                  avatar={ninja?.avatar}
                  className={`h-14 w-14 rounded-lg border lg:h-16 lg:w-16 ${side === 'BLUE' ? 'border-side-blue/60' : 'border-side-red/60'}`}
                />
                <span className="text-[10px] text-fog-500">P{i + 1}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-gold/30 bg-ink-800/70 p-5 lg:p-8">
      <h2 className="mb-4 flex items-center justify-center gap-2 text-sm font-bold tracking-widest text-gold">
        <Swords size={16} /> GAME {game.gameNumber} 阵容锁定
      </h2>
      <div className="flex items-center justify-center gap-3 sm:gap-6">
        {renderSide('BLUE')}
        <span className="text-2xl font-black italic text-fog-600 lg:text-3xl">VS</span>
        {renderSide('RED')}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => enterGame()}
          className="rounded-lg bg-gold px-6 py-2.5 text-sm font-bold text-ink-950 transition-all hover:brightness-110 active:scale-[0.98]"
        >
          进入比赛
        </button>
        <button
          type="button"
          onClick={() => undo()}
          disabled={!canUndo}
          className="rounded-lg border border-ink-500 px-4 py-2.5 text-sm text-fog-300 transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          返回修改（撤销）
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-fog-600">「返回修改」会撤销最后一步 BP 操作</p>
    </section>
  )
}
