import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Side } from '@/types/bp'
import type { Ninja } from '@/types/ninja'
import { getPhase } from '@/engine/bpEngine'
import { useBPStore } from '@/store/bpStore'
import { useNinjaStore } from '@/store/ninjaStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTimerStore } from '@/store/timerStore'
import { toast } from '@/store/toastStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { BPHeader } from '@/components/bp/BPHeader'
import { BPStage } from '@/components/bp/BPStage'
import { BPControlBar } from '@/components/bp/BPControlBar'
import { PlayerPanel } from '@/components/bp/PlayerPanel'
import { MobileTeamBar } from '@/components/bp/MobileTeamBar'
import { BPHistoryDrawer } from '@/components/bp/BPHistoryDrawer'
import { ReadyStage } from '@/components/bp/ReadyStage'
import { PlayingStage } from '@/components/bp/PlayingStage'
import { NinjaGrid, type StatusFilter } from '@/components/ninja/NinjaGrid'
import { NinjaSearch } from '@/components/ninja/NinjaSearch'
import { NinjaFilter, type QualityFilter } from '@/components/ninja/NinjaFilter'
import { GameResultDialog } from '@/components/match/GameResultDialog'
import { MatchResult } from '@/components/match/MatchResult'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { playSound } from '@/utils/sound'
import { normalizeForSearch } from '@/utils/format'

const QUALITY_ORDER = { S: 0, A: 1, B: 2, C: 3 } as const

/**
 * BP 主界面（赛事版式）：
 * 桌面 = 蓝方阵容 | 中央（阶段 + 忍者池） | 红方阵容 的对阵结构；
 * 手机 = 比分 → 阶段 → 双方阵容简版 → 搜索筛选 → 忍者池 → sticky 操作栏。
 * 全部可用性判断来自引擎，本组件只负责触发与提示。
 */
export default function BPPage() {
  const match = useBPStore((s) => s.match)
  const selectNinjaAction = useBPStore((s) => s.selectNinja)
  const setGameWinnerAction = useBPStore((s) => s.setGameWinner)
  const resetMatch = useBPStore((s) => s.resetMatch)
  const ninjas = useNinjaStore((s) => s.ninjas)
  const settings = useSettingsStore((s) => s.settings)
  const syncTimer = useTimerStore((s) => s.sync)
  const restartTimer = useTimerStore((s) => s.restart)

  const [search, setSearch] = useState('')
  const [quality, setQuality] = useState<QualityFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [winnerConfirm, setWinnerConfirm] = useState<Side | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [timeoutActive, setTimeoutActive] = useState(false)

  useKeyboardShortcuts()

  const filteredNinjas = useMemo(() => {
    const query = normalizeForSearch(search)
    let list = ninjas
    if (query) {
      list = list.filter(
        (n) =>
          normalizeForSearch(n.name).includes(query) ||
          (n.aliases?.some((alias) => normalizeForSearch(alias).includes(query)) ?? false),
      )
    }
    if (quality !== 'ALL') list = list.filter((n) => n.quality === quality)
    if (settings.ninjaSort === 'name') {
      list = [...list].sort(
        (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'),
      )
    } else {
      list = [...list].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] ||
          a.name.localeCompare(b.name, 'zh-Hans-CN'),
      )
    }
    return list
  }, [ninjas, search, quality, settings.ninjaSort])

  // 阶段推导（在所有 hook 之后使用；match 为空时页面会重定向回首页）
  const bpPhase = match ? getPhase(match) : null
  const gameNumber = bpPhase?.gameNumber ?? 0
  const stepIndex = bpPhase?.stepIndex ?? 0
  const sequenceComplete = bpPhase?.sequenceComplete ?? false
  const inBPNow = bpPhase ? bpPhase.status === 'BANNING' || bpPhase.status === 'PICKING' : false
  const timerSeconds = match?.rule.timerSeconds ?? 60
  const timerEnabled = match?.rule.timerEnabled ?? false

  // 计时器运行时：phaseKey 变化（新步骤 / 撤销回退 / 换局 / 换场）才会重建 deadline；
  // 同一步骤内的连续选择与页面刷新都沿用同一个 deadline。
  const phaseKey = match?.id
    ? `${match.id}:G${gameNumber}:${sequenceComplete ? 'DONE' : `S${stepIndex}`}`
    : null
  useEffect(() => {
    if (!phaseKey) return
    syncTimer({ phaseKey, seconds: timerSeconds, enabled: timerEnabled && inBPNow })
    setTimeoutActive(false)
  }, [phaseKey, timerSeconds, timerEnabled, inBPNow, syncTimer])

  if (!match) return <Navigate to="/" replace />

  const phase = getPhase(match)
  const inBP = phase.status === 'BANNING' || phase.status === 'PICKING'

  const handlePick = (ninja: Ninja) => {
    const result = selectNinjaAction(ninja.id)
    if (!result.ok && result.reason) {
      toast(result.reason, 'error')
      return
    }
    setTimeoutActive(false)
  }

  const handleConfirmWinner = (side: Side) => {
    const result = setGameWinnerAction(side)
    if (!result.ok) {
      if (result.reason) toast(result.reason, 'error')
      return
    }
    setTimeoutActive(false)
    if (useBPStore.getState().match?.status !== 'MATCH_FINISHED') {
      setResultOpen(true)
    }
  }

  const handleTimerExpire = () => {
    setTimeoutActive(true)
    playSound('timeout', settings.soundEnabled)
  }

  const stage = (
    <BPStage
      match={match}
      timeoutActive={timeoutActive}
      onResumeTimeout={() => setTimeoutActive(false)}
      onRestartTimer={() => {
        restartTimer(match.rule.timerSeconds)
        setTimeoutActive(false)
      }}
      onTimerExpire={handleTimerExpire}
    />
  )

  return (
    <div className="flex min-h-screen flex-col pb-14 lg:pb-0">
      <BPHeader match={match} onOpenHistory={() => setHistoryOpen(true)} onOpenReset={() => setResetOpen(true)} />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-2.5 py-3 lg:px-5 lg:py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(280px,320px)] lg:gap-4">
          {/* 桌面：左右阵容 */}
          <div className="hidden lg:order-1 lg:block">
            <PlayerPanel side="BLUE" />
          </div>
          <div className="hidden lg:order-3 lg:block">
            <PlayerPanel side="RED" />
          </div>

          {/* 中央：阶段 + 忍者池（移动端为单列） */}
          <div className="space-y-3 lg:order-2">
            {stage}
            <MobileTeamBar match={match} />

            {inBP && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <NinjaSearch value={search} onChange={setSearch} />
                  <NinjaFilter value={quality} onChange={setQuality} />
                  <div className="flex items-center gap-1 rounded-lg border border-ink-500 bg-ink-800 p-1" role="group" aria-label="状态筛选">
                    {(
                      [
                        ['ALL', '全部'],
                        ['AVAILABLE', '可用'],
                        ['BANNED', '已Ban'],
                        ['PICKED', '已选'],
                        ['USED', '已使用'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={statusFilter === value}
                        onClick={() => setStatusFilter(value)}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          statusFilter === value
                            ? 'bg-gold-accent text-ink-950'
                            : 'text-fog-500 hover:bg-ink-600 hover:text-fog-100'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={settings.ninjaSort}
                    onChange={(e) => useSettingsStore.getState().update({ ninjaSort: e.target.value as 'quality' | 'name' })}
                    aria-label="排序方式"
                    className="rounded-lg border border-ink-500 bg-ink-800 px-2 py-1.5 text-xs text-fog-300 focus:outline-none"
                  >
                    <option value="quality">品质排序</option>
                    <option value="name">名称排序</option>
                  </select>
                </div>
                <NinjaGrid ninjas={filteredNinjas} match={match} statusFilter={statusFilter} onPick={handlePick} />
              </section>
            )}

            {phase.status === 'READY' && <ReadyStage match={match} />}
            {phase.status === 'PLAYING' && <PlayingStage match={match} onRequestWinner={setWinnerConfirm} />}
            {phase.status === 'COMPLETED' && match.status !== 'MATCH_FINISHED' && (
              <section className="rounded-lg border border-border-muted bg-surface-1/60 p-6 text-center">
                <p className="text-sm font-semibold text-fog-100">本局胜负已记录</p>
                <button
                  type="button"
                  onClick={() => setResultOpen(true)}
                  className="mt-3 rounded bg-blue-team px-5 py-2 text-sm font-bold text-white transition-colors hover:brightness-110"
                >
                  查看结果 / 进入下一局
                </button>
              </section>
            )}
            {match.status === 'MATCH_FINISHED' && (
              <MatchResult
                match={match}
                extraActions={
                  <button
                    type="button"
                    onClick={() => setResetOpen(true)}
                    className="rounded bg-blue-team px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
                  >
                    重新开始
                  </button>
                }
              />
            )}
          </div>
        </div>
      </main>

      <BPControlBar match={match} onOpenHistory={() => setHistoryOpen(true)} />

      {/* 弹层 */}
      <BPHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <GameResultDialog match={match} open={resultOpen} onClose={() => setResultOpen(false)} />
      <ConfirmDialog
        open={!!winnerConfirm}
        title={`确认 Game ${phase.gameNumber} ${winnerConfirm === 'BLUE' ? '蓝方' : '红方'}获胜？`}
        message="确认后将记录本局比分，此操作可通过撤销回退。"
        confirmText="确认获胜"
        onConfirm={() => winnerConfirm && handleConfirmWinner(winnerConfirm)}
        onClose={() => setWinnerConfirm(null)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="重置比赛？"
        message="当前比赛进度将被清空，并以相同规则与选手开始一场新比赛。"
        confirmText="重置"
        danger
        onConfirm={() => {
          resetMatch()
          setTimeoutActive(false)
          toast('比赛已重置', 'success')
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  )
}
