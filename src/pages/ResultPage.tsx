import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { useBPStore } from '@/store/bpStore'
import { MatchResult } from '@/components/match/MatchResult'

/** /result/:id —— 完整赛果与 BP 复盘 */
export default function ResultPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const match = useBPStore((s) => s.recentMatches.find((m) => m.id === id))
  const continueMatch = useBPStore((s) => s.continueMatch)

  if (!match) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="text-sm text-fog-300">没有找到这场比赛的记录</p>
        <p className="text-xs text-fog-600">记录可能已被删除，或数据已清空</p>
        <Link to="/" className="mt-2 rounded-lg bg-side-blue px-4 py-2 text-sm font-medium text-white hover:bg-side-blue/85">
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      <div className="mt-6 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-fog-400 transition-colors hover:text-fog-100">
          <ArrowLeft size={15} /> 返回首页
        </Link>
        {match.status !== 'MATCH_FINISHED' && (
          <button
            type="button"
            onClick={() => {
              if (continueMatch(match.id)) navigate('/bp')
            }}
            className="flex items-center gap-1.5 rounded-lg bg-side-blue px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-side-blue/85"
          >
            <Play size={13} /> 继续这场比赛
          </button>
        )}
      </div>
      <div className="mt-4">
        <MatchResult match={match} />
      </div>
    </div>
  )
}
