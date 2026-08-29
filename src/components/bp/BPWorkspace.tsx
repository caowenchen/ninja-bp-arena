import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Side } from '@/types/bp'
import { getPhase } from '@/engine/bpEngine'
import { useNinjaStore } from '@/store/ninjaStore'
import { useSettingsStore } from '@/store/settingsStore'
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
import { useMatchSource } from '@/matchSource/context'
import { syncLocalTimer } from '@/matchSource/LocalMatchSource'
import { useOnlineRoomStore } from '@/online/onlineRoomStore'
import { useBPStore } from '@/store/bpStore'
import { playSound } from '@/utils/sound'
import { normalizeForSearch } from '@/utils/format'
import { CheckCircle2, Hourglass } from 'lucide-react'

const QUALITY_ORDER = { S: 0, A: 1, B: 2, C: 3 } as const

/**
 * BP 工作区（本地 / 在线共用）。
 * 一切操作通过 MatchSource 抽象：本地 = 直接执行；在线 = 发送服务端命令。
 */
export function BPWorkspace() {
  const source = useMatchSource()
  const match = source.match
  const ninjas = useNinjaStore((s) => s.ninjas)
  const settings = useSettingsStore((s) => s.settings)
  const isOnline = source.mode === 'online'

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
    let pool = ninjas
    // 在线模式：以房间忍者池快照为准（服务端按它校验）
    if (isOnline && source.onlineNinjaIds) {
      const ids = new Set(source.onlineNinjaIds)
      pool = pool.filter((n) => ids.has(n.id))
    }
    const query = normalizeForSearch(search)
    let list = pool
    if (query) {
      list = list.filter(
        (n) =>
          normalizeForSearch(n.name).includes(query) ||
          (n.aliases?.some((alias) => normalizeForSearch(alias).includes(query)) ?? false),
      )
    }
    if (quality !== 'ALL') list = list.filter((n) => n.quality === quality)
    if (settings.ninjaSort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else {
      list = [...list].sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] ||
          a.name.localeCompare(b.name, 'zh-Hans-CN'),
      )
    }
    return list
  }, [ninjas, search, quality, settings.ninjaSort, isOnline, source.onlineNinjaIds])

  // 计时器：本地模式由客户端持久化 deadline；在线模式使用服务端权威 deadline
  const bpPhase = match ? getPhase(match) : null
  const inBPNow = bpPhase ? bpPhase.status === 'BANNING' || bpPhase.status === 'PICKING' : false
  useEffect(() => {
    if (!match) return
    if (source.mode === 'local') syncLocalTimer(match, inBPNow)
    setTimeoutActive(false)
  }, [match, source.mode, inBPNow])

  if (!match) return <Navigate to="/" replace />

  const phase = getPhase(match)
  const inBP = phase.status === 'BANNING' || phase.status === 'PICKING'

  const handlePick = (ninjaId: string, name: string) => {
    if (isOnline) {
      if (source.pendingCommand) {
        toast('正在确认上一步操作……', 'info')
        return
      }
      if (source.connection === 'offline') {
        toast('连接已断开，正在重新连接', 'error')
        return
      }
      if (!source.isMyTurn) {
        // 本地状态可能滞后（Realtime 事件在途）：先强制重拉权威快照再判断一次
        void (async () => {
          await source.resync?.()
          if (!useOnlineRoomStore.getState().isMyTurnNow()) {
            toast('等待对方选择……', 'info')
            return
          }
          const result = await Promise.resolve(source.selectNinja(ninjaId))
          if (!result.ok && result.reason) {
            toast(result.reason, 'error')
            return
          }
          toast(`已提交 ${name}，等待确认…`, 'info')
          setTimeoutActive(false)
        })()
        return
      }
    }
    void Promise.resolve(source.selectNinja(ninjaId)).then((result) => {
      if (!result.ok && result.reason) {
        toast(result.reason, 'error')
        return
      }
      if (isOnline) toast(`已提交 ${name}，等待确认…`, 'info')
      setTimeoutActive(false)
    })
  }

  const handleConfirmWinner = (side: Side) => {
    void Promise.resolve(source.setGameWinner(side)).then((result) => {
      if (!result.ok) {
        if (result.reason) toast(result.reason, 'error')
        return
      }
      setTimeoutActive(false)
      if (isOnline) {
        const status = useOnlineRoomStore.getState().match?.status
        if (status !== 'MATCH_FINISHED') setResultOpen(true)
      } else if (useBPStore.getState().match?.status !== 'MATCH_FINISHED') {
        setResultOpen(true)
      }
    })
  }

  const handleTimerExpire = () => {
    setTimeoutActive(true)
    playSound('timeout', settings.soundEnabled)
  }

  const deadlineOverride = isOnline ? (source.onlineDeadline ?? null) : undefined
  const waitingOther = isOnline && inBP && !source.isMyTurn

  const stage = (
    <BPStage
      match={match}
      timeoutActive={timeoutActive}
      onResumeTimeout={() => setTimeoutActive(false)}
      onRestartTimer={() => {
        source.restartTimer()
        setTimeoutActive(false)
      }}
      onTimerExpire={handleTimerExpire}
      deadlineOverride={deadlineOverride}
    />
  )

  return (
    <div className="flex min-h-screen flex-col pb-14 lg:pb-0">
      <BPHeader match={match} onOpenHistory={() => setHistoryOpen(true)} onOpenReset={() => setResetOpen(true)} />

      {/* 在线：轮到谁操作 / 撤销请求横幅 */}
      {isOnline && <OnlineBanners />}

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-2.5 py-3 lg:px-5 lg:py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(280px,320px)] lg:gap-4">
          <div className="hidden lg:order-1 lg:block">
            <PlayerPanel side="BLUE" />
          </div>
          <div className="hidden lg:order-3 lg:block">
            <PlayerPanel side="RED" />
          </div>

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
                          statusFilter === value ? 'bg-gold-accent text-ink-950' : 'text-fog-500 hover:bg-ink-600 hover:text-fog-100'
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
                <div className={waitingOther ? 'opacity-70' : ''}>
                  <NinjaGrid
                    ninjas={filteredNinjas}
                    match={match}
                    statusFilter={statusFilter}
                    onPick={(ninja) => handlePick(ninja.id, ninja.name)}
                  />
                </div>
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
        message={
          isOnline
            ? '将以相同规则与选手开始一场全新比赛（在线模式下由服务端执行）。'
            : '当前比赛进度将被清空，并以相同规则与选手开始一场新比赛。'
        }
        confirmText="重置"
        danger
        onConfirm={() => {
          source.resetMatch()
          setTimeoutActive(false)
          toast('比赛已重置', 'success')
        }}
        onClose={() => setResetOpen(false)}
      />
    </div>
  )
}

/** 在线模式顶部横幅：回合提示 + 撤销请求 */
function OnlineBanners() {
  const source = useMatchSource()
  const match = source.match
  if (!match) return null
  const phase = getPhase(match)
  const inBP = phase.status === 'BANNING' || phase.status === 'PICKING'
  const pending = source.pendingUndo

  return (
    <div className="mx-auto w-full max-w-[1500px] px-2.5 pt-2 lg:px-5">
      {source.isMyTurn && inBP && source.canOperate && (
        <div className="flex items-center justify-center gap-1.5 rounded border border-gold-accent/40 bg-gold-accent/10 py-1.5 text-xs font-bold text-gold-accent">
          <CheckCircle2 size={13} /> 轮到你操作（{source.mySeat === 'BLUE' ? '蓝方' : '红方'}）
        </div>
      )}
      {inBP && !source.isMyTurn && !pending && (
        <div className="flex items-center justify-center gap-1.5 rounded border border-border-muted bg-surface-1/60 py-1.5 text-xs text-fog-500">
          <Hourglass size={12} className="animate-pulse" /> 等待对方选择……
        </div>
      )}
      {pending && pending.requestedByUserId === source.myUserId && (
        <div className="flex items-center justify-center gap-2 rounded border border-gold-accent/40 bg-gold-accent/10 py-1.5 text-xs text-gold-accent">
          已发送撤销请求，等待对方处理
          <button
            type="button"
            onClick={() =>
              void Promise.resolve(source.undo()).then((r) => {
                if (!r.ok && r.reason) toast(r.reason, 'error')
              })
            }
            className="text-fog-500 underline underline-offset-2 hover:text-fog-300"
          >
            撤回请求
          </button>
        </div>
      )}
      {pending && pending.requestedByUserId !== source.myUserId && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded border border-gold-accent/40 bg-gold-accent/10 py-1.5 text-xs text-gold-accent">
          {pending.requestedBy === 'BLUE' ? '蓝方' : '红方'}请求撤销上一步
          <button
            type="button"
            onClick={() => {
              void Promise.resolve(useOnlineRoomStore.getState().sendCommand('CONFIRM_UNDO')).then((res) => {
                if (!res.ok && res.reason) toast(res.reason, 'error')
              })
            }}
            className="rounded bg-gold-accent px-2.5 py-0.5 font-bold text-ink-950 hover:brightness-110"
          >
            接受
          </button>
          <button
            type="button"
            onClick={() => {
              void Promise.resolve(useOnlineRoomStore.getState().sendCommand('REJECT_UNDO')).then((res) => {
                if (!res.ok && res.reason) toast(res.reason, 'error')
              })
            }}
            className="rounded border border-gold-accent/50 px-2.5 py-0.5 text-gold-accent hover:bg-gold-accent/10"
          >
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}
