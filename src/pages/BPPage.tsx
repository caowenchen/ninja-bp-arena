import { LocalMatchSource } from '@/matchSource/LocalMatchSource'
import { BPWorkspace } from '@/components/bp/BPWorkspace'

/** 本地 BP 页：v0.2.0 的单机模式，完全离线可用（共享 BP 工作区） */
export default function BPPage() {
  return (
    <LocalMatchSource>
      <BPWorkspace />
    </LocalMatchSource>
  )
}
