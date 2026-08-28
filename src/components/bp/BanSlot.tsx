import type { Ninja } from '@/types/ninja'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'

interface BanSlotProps {
  ninja?: Ninja
}

/** Ban 槽位：比 Pick 小、灰阶 + 斜杠 + BAN 标签，但仍能认出是谁 */
export function BanSlot({ ninja }: BanSlotProps) {
  if (!ninja) {
    return (
      <div className="flex h-12 w-10 flex-col items-center justify-center rounded border border-dashed border-border-strong bg-surface-2/50" title="空 Ban 位">
        <span className="text-[8px] font-bold tracking-widest text-ink-400">BAN</span>
      </div>
    )
  }
  return (
    <div className="flex w-10 flex-col items-center gap-0.5" title={`${ninja.name}（已被禁用）`}>
      <div className="relative h-12 w-10 overflow-hidden rounded border border-red-team/50">
        <NinjaAvatar name={ninja.name} avatar={ninja.avatar} className="h-full w-full opacity-45 saturate-0" textClassName="text-base" />
        <div className="ban-slash absolute inset-0" />
        <span className="absolute inset-x-0 bottom-0 bg-red-team/90 text-center text-[8px] font-bold tracking-widest text-white">
          BAN
        </span>
      </div>
      <span className="w-full truncate text-center text-[9px] leading-3 text-fog-500">{ninja.name}</span>
    </div>
  )
}
