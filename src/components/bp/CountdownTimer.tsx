import { useEffect, useRef, useState } from 'react'

interface CountdownTimerProps {
  enabled: boolean
  seconds: number
  /** 步骤标识：变化时重置倒计时（同一 Step 内连续选择不重置） */
  resetKey: string
  running: boolean
  /** 外部「重新计时」信号：数值变化时重置 */
  restartSignal: number
  onExpire: () => void
}

/**
 * 倒计时：每个序列步骤共用一份时间（RED PICK×2 不因第一个 Pick 重置）。
 * 归零不自动代替玩家操作，只回调 onExpire 由界面进入超时状态。
 */
export function CountdownTimer({ enabled, seconds, resetKey, running, restartSignal, onExpire }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  const expiredRef = useRef(false)

  // 新步骤 / 重新计时 / 秒数变更 → 重置
  useEffect(() => {
    setRemaining(seconds)
    expiredRef.current = false
  }, [resetKey, restartSignal, seconds])

  useEffect(() => {
    if (!running || !enabled) return
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, enabled, resetKey, restartSignal, seconds])

  useEffect(() => {
    if (remaining === 0 && !expiredRef.current && running && enabled) {
      expiredRef.current = true
      onExpire()
    }
  }, [remaining, running, enabled, onExpire])

  if (!enabled) return null

  const total = Math.max(1, seconds)
  const progress = remaining / total
  const warning = remaining <= 10
  const radius = 26
  const circumference = 2 * Math.PI * radius

  return (
    <div className={`relative flex items-center gap-2 ${warning && running ? 'timer-warning' : ''}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-ink-600" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={warning ? 'text-side-red' : 'text-gold'}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-base font-bold tabular-nums ${warning ? 'text-side-red' : 'text-fog-100'}`}>{remaining}</span>
      </div>
    </div>
  )
}
