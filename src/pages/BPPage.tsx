import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Side } from '@/types/bp'
import type { Ninja } from '@/types/ninja'
import { getPhase } from '@/engine/bpEngine'
import { useBPStore } from '@/store/bpStore'
import { useNinjaStore } from '@/store/ninjaStore'
import { useSettingsStore } from '@/store/settingsStore'
import { toast } from '@/store/toastStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { BPHeader } from '@/components/bp/BPHeader'
import { BPStage } from '@/components/bp/BPStage'
import { BPControlBar } from '@/components/bp/BPControlBar'
import { PlayerPanel } from '@/components/bp/PlayerPanel'
import { BPHistoryDrawer } from '@/components/bp/BPHistoryDrawer'
import { ReadyStage } from '@/components/bp/ReadyStage'
import { PlayingStage } from '@/components/bp/PlayingStage'
import { NinjaGrid } from '@/components/ninja/NinjaGrid'
import { NinjaSearch } from '@/components/ninja/NinjaSearch'
import { NinjaFilter, type QualityFilter } from '@/components/ninja/NinjaFilter'
import { GameResultDialog } from '@/components/match/GameResultDialog'
import { MatchResult } from '@/components/match/MatchResult'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { playSound } from '@/utils/sound'
import { normalizeForSearch } from '@/utils/format'

const QUALITY_ORDER = { S: 0, A: 1, B: 2, C: 3 } as const

/**
 * BP 主界面。
 * 布局（桌面）：BLUE 面板 | 中央舞台 | RED 面板，下方为忍者选择区；
 * 移动端：比分 / 阶段 / 双方阵容 / 搜索 / 忍者池 / sticky 底栏。
 * 全部可用性判断来自引擎，本组件只负责触发与提示。
 */
export default function BPPage() {
  const match = useBPStore((s) => s.match)
  const selectNinjaAction = useBPStore((s) => s.selectNinja)
  const setGameWinnerAction = useBPStore((s) => s.setGameWinner)
  const resetMatch = useBPStore((s) => s.resetMatch)
  const ninjas = useNinjaStore((s) => s.ninjas)
  const settings = useSettingsStore((s) => s.settings)

  const [search, setSearch] = useState('')
  const [quality, setQuality] = useState<QualityFilter>('ALL')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [winnerConfirm, setWinnerConfirm] = useState<Side | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [timeoutActive, setTimeoutActive] = useState(false)
  const [restartSignal, setRestartSignal] = useState(0)

  useKeyboardShortcuts()

  const filteredNinjas = useMemo(() => {
    const query = normalizeForSearch(search)
    let list = ninjas
    if (query) list = list.filter((n) => normalizeForSearch(n.name).includes(query))
    if (quality !== 'ALL') list = list.filter((n) => n.quality === quality)
    if (settings.ninjaSort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else {
      list = [...list].sort((a, b) => QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }
    return list
  }, [ninjas, search, quality, settings.ninjaSort])

  if (!match) return <Navigate to="/" replace />

  const phase = getPhase(match)
  const inBP = phase.status === 'BANNING' || phase.status === 'PICKING'

  const handlePick = (ninja: Ninja) => {
    const result = selectNinjaAction(ninja.id)
    if (!result.ok && result.reason) {
      toast(result.reason, 'error')
      return
    }
    // 操作成功后阶段推进，超时状态自然解除
    setTimeoutActive(false)
  }

  const handleConfirmWinner = (side: Side) => {
    const result = setGameWinnerAction(side)
    if (!result.ok) {
      if (result.reason) toast(result.reason, 'error')
      return
    }
    setTimeoutActive(false)
    // 未整场结束时弹出本局结果；整场结束由下方 Finished 区域呈现
    if (useBPStore.getState().match?.status !== 'MATCH_FINISHED') {
      setResultOpen(true)
    }
  }

  const handleTimerExpire = () => {
    setTimeoutActive(true)
    playSound('timeout', settings.soundEnabled)
  }

  return (
    <div className="flex min-h-screen flex-col pb-14">
      <BPHeader match={match} onOpenHistory={() => setHistoryOpen(true)} onOpenReset={() => setResetOpen(true)} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-3 px-3 py-3 lg:px-6 lg:py-4">
        {/* 三栏：移动端 舞台在上，双方面板并排 */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(230px,280px)_1fr_minmax(230px,280px)] lg:gap-4">
          <BPStage
            match={match}
            className="col-span-2 lg:order-2 lg:col-span-1"
            timeoutActive={timeoutActive}
            onResumeTimeout={() => setTimeoutActive(false)}
            onRestartTimer={() => {
              setTimeoutActive(false)
              setRestartSignal((n) => n + 1)
            }}
            restartSignal={restartSignal}
            onTimerExpire={handleTimerExpire}
          />
          <div className="lg:order-1">
            <PlayerPanel side="BLUE" />
          </div>
          <div className="lg:order-3">
            <PlayerPanel side="RED" />
          </div>
        </div>

        {/* 阶段主区域 */}
        {inBP && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <NinjaSearch value={search} onChange={setSearch} />
              <NinjaFilter value={quality} onChange={setQuality} />
              <span className="ml-auto hidden text-xs text-fog-600 sm:block">
                {filteredNinjas.length} 名忍者 · 点击卡片执行 {phase.action === 'BAN' ? '禁用' : '选择'}
              </span>
            </div>
            <NinjaGrid ninjas={filteredNinjas} match={match} onPick={handlePick} />
          </section>
        )}
        {phase.status === 'READY' && <ReadyStage match={match} />}
        {phase.status === 'PLAYING' && <PlayingStage match={match} onRequestWinner={setWinnerConfirm} />}
        {phase.status === 'COMPLETED' && match.status !== 'MATCH_FINISHED' && (
          <section className="rounded-xl border border-ink-600 bg-ink-800/70 p-6 text-center">
            <p className="text-sm font-semibold text-fog-100">本局胜负已记录</p>
            <button
              type="button"
              onClick={() => setResultOpen(true)}
              className="mt-3 rounded-lg bg-side-blue px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-side-blue/85"
            >
              查看结果 / 进入下一局
            </button>
          </section>
        )}
        {match.status === 'MATCH_FINISHED' && (
          <MatchResult
            match={match}
            extraActions={
              <>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="rounded-lg bg-side-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-side-blue/85"
                >
                  重新开始
                </button>
              </>
            }
          />
        )}
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
          setRestartSignal((n) => n + 1)
          toast('比赛已重置', 'success')
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  )
}
