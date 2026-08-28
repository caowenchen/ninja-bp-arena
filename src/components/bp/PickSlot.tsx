import type { Ninja } from '@/types/ninja'
import type { Side } from '@/types/bp'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'

interface PickSlotProps {
  ninja?: Ninja
  /** 该方第几个选择（1 起），显示 P1/P2/P3 小标签 */
  order: number
  side: Side
}

/**
 * Pick 槽位：竖向人物卡比例的电竞选人槽。
 * 顶部角色图、底部角色名、边缘队伍色、P1/P2/P3 小标签。
 * 入槽时带 180ms 淡入缩放动画（fx-off / reduced-motion 下自动关闭）。
 */
export function PickSlot({ ninja, order, side }: PickSlotProps) {
  const isBlue = side === 'BLUE'
  const edge = isBlue ? 'border-blue-team/60' : 'border-red-team/60'
  const badge = isBlue ? 'bg-blue-team text-white' : 'bg-red-team text-white'
  const emptyHint = isBlue ? 'text-blue-team/40' : 'text-red-team/40'

  if (!ninja) {
    return (
      <div
        className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-border-strong bg-surface-2/40`}
        title={`空 Pick 位 P${order}`}
      >
        <span className={`text-[10px] font-bold ${emptyHint}`}>P{order}</span>
      </div>
    )
  }

  return (
    <div
      className={`slot-in relative aspect-[3/4] w-full overflow-hidden rounded border bg-surface-1 ${edge}`}
      title={ninja.name}
    >
      <NinjaAvatar name={ninja.name} avatar={ninja.avatar} className="h-[74%] w-full" textClassName="text-2xl" />
      <div className="flex h-[26%] items-center justify-center px-0.5">
        <span className="line-clamp-2 break-all text-center text-[10px] leading-tight text-fog-100">{ninja.name}</span>
      </div>
      <span className={`absolute left-0 top-0 rounded-br px-1 text-[8px] font-bold ${badge}`}>P{order}</span>
      {/* 队伍色左边缘 */}
      <span className={`absolute inset-y-0 left-0 w-0.5 ${isBlue ? 'bg-blue-team' : 'bg-red-team'}`} />
    </div>
  )
}
