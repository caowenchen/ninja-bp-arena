import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Play, Trash2 } from 'lucide-react'
import { useBPStore } from '@/store/bpStore'
import { useSettingsStore } from '@/store/settingsStore'
import { MatchSetupDialog } from '@/components/match/MatchSetupDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { formatDateTime } from '@/utils/format'
import { SIDE_TEXT } from '@/types/bp'
import type { MatchState } from '@/types/match'

export default function HomePage() {
  const navigate = useNavigate()
  const recentMatches = useBPStore((s) => s.recentMatches)
  const continueMatch = useBPStore((s) => s.continueMatch)
  const deleteRecent = useBPStore((s) => s.deleteRecent)
  const currentMatch = useBPStore((s) => s.match)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)

  const [setupOpen, setSetupOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MatchState | null>(null)

  const unfinishedCurrent = useMemo(
    () => (currentMatch && currentMatch.status !== 'MATCH_FINISHED' ? currentMatch : null),
    [currentMatch],
  )

  const handleContinue = (id: string) => {
    const match = continueMatch(id)
    if (match) navigate('/bp')
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16">
      {/* Hero：第一屏重点是「开始比赛」 */}
      <section className="bg-arena-grid bg-chakra-flow relative mt-5 overflow-hidden rounded-lg border border-border-muted px-6 py-14 text-center lg:py-20">
        <p className="mb-4 inline-block border border-gold-accent/40 bg-gold-accent/10 px-2.5 py-0.5 text-[11px] tracking-[0.3em] text-gold-accent">
          玩家自制 · 非官方
        </p>
        <h1 className="text-hero text-5xl font-black tracking-wide lg:text-7xl">忍界 BP</h1>
        <p className="mt-4 text-sm tracking-[0.2em] text-fog-300 lg:text-base">
          火影忍者手游 · 武斗赛 BP 模拟器
        </p>
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-fog-600">
          完整模拟 BO3 Ban / Pick 流程：禁用继承、忍者消耗、比分推进与 BP 复盘
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="flex items-center gap-2 rounded bg-blue-team px-7 py-3 text-sm font-bold text-white shadow-lg shadow-blue-team/20 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Play size={15} /> 开始 BP
          </button>
          <Link
            to="/online"
            className="rounded border border-gold-accent/50 bg-gold-accent/10 px-5 py-3 text-sm font-bold text-gold-accent transition-colors hover:bg-gold-accent/20"
          >
            在线 BP
          </Link>
          <Link
            to="/ninjas"
            className="rounded border border-border-strong px-5 py-3 text-sm text-fog-300 transition-colors hover:bg-surface-2"
          >
            忍者池
          </Link>
          <Link
            to="/settings"
            className="rounded border border-border-strong px-5 py-3 text-sm text-fog-300 transition-colors hover:bg-surface-2"
          >
            规则
          </Link>
          <Link
            to="/about"
            className="rounded border border-border-strong px-5 py-3 text-sm text-fog-300 transition-colors hover:bg-surface-2"
          >
            关于
          </Link>
        </div>

        {unfinishedCurrent && (
          <button
            type="button"
            onClick={() => handleContinue(unfinishedCurrent.id)}
            className="mx-auto mt-7 flex items-center gap-3 rounded border border-gold-accent/40 bg-gold-accent/10 px-5 py-2.5 text-left transition-colors hover:bg-gold-accent/15"
          >
            <span>
              <span className="block text-sm font-semibold text-fog-100">继续未完成的比赛</span>
              <span className="block text-xs text-fog-500">
                {unfinishedCurrent.bluePlayerName} {unfinishedCurrent.score.blue}:{unfinishedCurrent.score.red}{' '}
                {unfinishedCurrent.redPlayerName}
              </span>
            </span>
            <ChevronRight size={15} className="text-fog-600" />
          </button>
        )}

        {/* 首次使用引导（轻量一行） */}
        {!settings.firstUseTipSeen && (
          <p className="mx-auto mt-8 max-w-xl text-xs leading-relaxed text-fog-500">
            流程只有 4 步：<span className="text-fog-300">按序 Ban</span> →{' '}
            <span className="text-fog-300">按序 Pick</span> →{' '}
            <span className="text-fog-300">记录本局胜负</span> →{' '}
            <span className="text-fog-300">BO3 自动推进</span>
            <button
              type="button"
              onClick={() => updateSettings({ firstUseTipSeen: true })}
              className="ml-2 text-fog-600 underline underline-offset-2 hover:text-fog-300"
            >
              知道了
            </button>
          </p>
        )}
      </section>

      {/* 最近比赛：降低视觉优先级 */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-bold tracking-[0.25em] text-fog-600">最近比赛</h2>
        {recentMatches.length === 0 ? (
          <p className="rounded border border-dashed border-border-strong py-8 text-center text-sm text-fog-600">
            还没有比赛记录
          </p>
        ) : (
          <ul className="divide-y divide-border-muted rounded border border-border-muted">
            {recentMatches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 bg-surface-1/40 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fog-100">
                    <span className="text-blue-team-soft">{m.bluePlayerName}</span>
                    <span className="mx-2 font-bold tabular-nums">
                      {m.score.blue} : {m.score.red}
                    </span>
                    <span className="text-red-team-soft">{m.redPlayerName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-fog-600">{formatDateTime(m.updatedAt)}</p>
                </div>
                <span
                  className={`text-[11px] font-bold ${
                    m.status === 'MATCH_FINISHED' ? 'text-emerald-400/90' : 'text-gold-accent'
                  }`}
                >
                  {m.status === 'MATCH_FINISHED'
                    ? `${SIDE_TEXT[m.score.blue >= m.rule.winsRequired ? 'BLUE' : 'RED']}胜`
                    : '进行中'}
                </span>
                <div className="flex gap-1.5">
                  {m.status === 'MATCH_FINISHED' ? (
                    <Link
                      to={`/result/${m.id}`}
                      className="rounded border border-border-strong px-2.5 py-1 text-xs text-fog-300 transition-colors hover:bg-surface-2"
                    >
                      结果
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleContinue(m.id)}
                      className="rounded bg-blue-team/90 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:brightness-110"
                    >
                      继续
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    aria-label="删除记录"
                    className="rounded border border-border-strong p-1 text-fog-600 transition-colors hover:border-red-team/50 hover:text-red-team-soft"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MatchSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} unfinished={unfinishedCurrent} />
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除比赛记录？"
        message={`将删除「${deleteTarget?.bluePlayerName} vs ${deleteTarget?.redPlayerName}」的比赛记录，不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => deleteTarget && deleteRecent(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
