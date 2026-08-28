import { Ban } from 'lucide-react'
import type { Ninja } from '@/types/ninja'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'

interface BanSlotProps {
  ninja?: Ninja
}

/** Ban 槽位：已 Ban 显示头像 + 斜杠 + BAN 标记（保持可辨认） */
export function BanSlot({ ninja }: BanSlotProps) {
  if (!ninja) {
    return (
      <div className="flex h-14 w-11 items-center justify-center rounded-md border border-dashed border-ink-500 bg-ink-800/40 lg:h-16 lg:w-14" title="空 Ban 位">
        <Ban size={12} className="text-ink-400" />
      </div>
    )
  }
  return (
    <div className="relative h-14 w-11 overflow-hidden rounded-md border border-side-red/50 lg:h-16 lg:w-14" title={`${ninja.name}（已被禁用）`}>
      <NinjaAvatar name={ninja.name} avatar={ninja.avatar} className="h-full w-full opacity-45 saturate-0" textClassName="text-lg" />
      <div className="ban-slash absolute inset-0" />
      <span className="absolute inset-x-0 bottom-0 bg-side-red/85 text-center text-[9px] font-bold tracking-widest text-white">
        BAN
      </span>
    </div>
  )
}
