import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Clock, Play, Repeat, ScrollText, Swords, Trash2, Trophy } from 'lucide-react'
import { useBPStore } from '@/store/bpStore'
import { useSettingsStore } from '@/store/settingsStore'
import { MatchSetupDialog } from '@/components/match/MatchSetupDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { formatDateTime } from '@/utils/format'
import { SIDE_TEXT } from '@/types/bp'
import type { MatchState } from '@/types/match'

const FEATURES = [
  { icon: Repeat, title: 'BO3 赛制', desc: '三局两胜自动推进，比分与胜负全程记录' },
  { icon: Swords, title: 'Ban / Pick 序列', desc: '蓝红双方按配置顺序禁用与选择，规则可配置' },
  { icon: Clock, title: '赛事训练', desc: '倒计时 + 连续行动提示，还原赛场 BP 节奏' },
  { icon: ScrollText, title: 'BP 复盘', desc: '完整操作历史、赛果文本与 JSON 导出' },
] as const

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
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      {/* Hero */}
      <section className="bg-arena relative mt-6 overflow-hidden rounded-2xl border border-ink-600 px-6 py-12 text-center lg:py-16">
        <p className="mb-3 inline-block rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] tracking-widest text-gold">
          玩家自制 · 非官方赛事工具
        </p>
        <h1 className="text-hero text-4xl font-black tracking-wide lg:text-6xl">忍界 BP</h1>
        <p className="mt-3 text-sm text-fog-300 lg:text-base">火影忍者手游 · 武斗赛 BP 模拟器</p>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-fog-600">
          完整模拟 BO3 Ban / Pick 流程：禁用继承、忍者消耗、比分推进与 BP 复盘，全部在浏览器本地完成。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-side-blue px-7 py-3 text-sm font-bold text-white shadow-lg shadow-side-blue/25 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Play size={16} /> 开始 BP
          </button>
          <Link
            to="/ninjas"
            className="rounded-lg border border-ink-500 px-5 py-3 text-sm text-fog-300 transition-colors hover:bg-ink-600"
          >
            忍者池管理
          </Link>
          <Link
            to="/settings"
            className="rounded-lg border border-ink-500 px-5 py-3 text-sm text-fog-300 transition-colors hover:bg-ink-600"
          >
            设置
          </Link>
        </div>

        {unfinishedCurrent && (
          <button
            type="button"
            onClick={() => handleContinue(unfinishedCurrent.id)}
            className="mx-auto mt-6 flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-left transition-colors hover:bg-gold/15"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/20 text-gold">
              <Play size={16} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-fog-100">有未完成的比赛</span>
              <span className="block text-xs text-fog-500">
                {unfinishedCurrent.bluePlayerName} {unfinishedCurrent.score.blue}:{unfinishedCurrent.score.red}{' '}
                {unfinishedCurrent.redPlayerName} · 点击继续
              </span>
            </span>
            <ChevronRight size={16} className="text-fog-600" />
          </button>
        )}
      </section>

      {/* 首次使用引导 */}
      {!settings.firstUseTipSeen && (
        <section className="mt-4 rounded-xl border border-ink-600 bg-ink-800/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-fog-100">第一次使用？流程只有 4 步</h2>
              <p className="mt-1 text-xs text-fog-500">
                1. 按顺序 Ban 忍者 → 2. 按顺序 Pick 上场阵容 → 3. 记录本局胜负 → 4. BO3 自动推进到比赛结束
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  updateSettings({ firstUseTipSeen: true })
                  setSetupOpen(true)
                }}
                className="rounded-lg bg-side-blue px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-side-blue/85"
              >
                开始 BP
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ firstUseTipSeen: true })}
                className="rounded-lg border border-ink-500 px-4 py-2 text-xs text-fog-400 transition-colors hover:bg-ink-600"
              >
                知道了
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 特点 */}
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-ink-600 bg-ink-800/50 p-4 transition-colors hover:border-ink-500">
            <f.icon size={18} className="text-side-blue-soft" />
            <h3 className="mt-2 text-sm font-semibold text-fog-100">{f.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-fog-600">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* 最近比赛 */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-fog-100">
          <Trophy size={14} className="text-gold" /> 最近比赛
        </h2>
        {recentMatches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-500 py-10 text-center text-sm text-fog-600">
            还没有比赛记录，点击「开始 BP」创建第一场
          </div>
        ) : (
          <ul className="space-y-2">
            {recentMatches.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fog-100">
                    <span className="text-side-blue-soft">{m.bluePlayerName}</span>
                    <span className="mx-2 font-bold tabular-nums">
                      {m.score.blue} : {m.score.red}
                    </span>
                    <span className="text-side-red-soft">{m.redPlayerName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-fog-600">
                    {formatDateTime(m.updatedAt)} · {m.rule.name}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    m.status === 'MATCH_FINISHED'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-gold/15 text-gold'
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
                      className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs text-fog-300 transition-colors hover:bg-ink-600"
                    >
                      查看结果
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleContinue(m.id)}
                      className="rounded-lg bg-side-blue/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-side-blue"
                    >
                      继续比赛
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    aria-label="删除记录"
                    className="rounded-lg border border-ink-500 p-1.5 text-fog-500 transition-colors hover:border-side-red/50 hover:text-side-red-soft"
                  >
                    <Trash2 size={14} />
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
