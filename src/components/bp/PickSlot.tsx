import type { Ninja } from '@/types/ninja'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'

interface PickSlotProps {
  ninja?: Ninja
  /** 该方第几个选择（1 起），显示 P1/P2/P3 */
  order: number
  side: 'BLUE' | 'RED'
}

/** Pick 槽位：头像 + 名字 + 选择顺序，蓝/红边框 */
export function PickSlot({ ninja, order, side }: PickSlotProps) {
  const border = side === 'BLUE' ? 'border-side-blue/60' : 'border-side-red/60'
  const badge = side === 'BLUE' ? 'bg-side-blue text-white' : 'bg-side-red text-white'

  if (!ninja) {
    return (
      <div
        className="flex h-14 w-11 items-center justify-center rounded-md border border-dashed border-ink-500 bg-ink-800/40 lg:h-16 lg:w-14"
        title={`空 Pick 位 P${order}`}
      >
        <span className="text-[10px] font-medium text-ink-400">P{order}</span>
      </div>
    )
  }

  return (
    <div className={`relative h-14 w-11 overflow-hidden rounded-md border lg:h-16 lg:w-14 ${border}`} title={ninja.name}>
      <NinjaAvatar name={ninja.name} avatar={ninja.avatar} className="h-full w-full" textClassName="text-lg" />
      <span className={`absolute left-0 top-0 rounded-br px-1 text-[8px] font-bold ${badge}`}>P{order}</span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-ink-950/80 px-0.5 text-center text-[8px] leading-3.5 text-fog-300">
        {ninja.name}
      </span>
    </div>
  )
}
