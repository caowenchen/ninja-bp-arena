import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Share2, Trash2 } from 'lucide-react'
import { createReplayFromMatch } from '@bp-core'
import { ReplayViewer } from '@/components/replay/ReplayViewer'
import { ShareReplayDialog } from '@/components/replay/ShareReplayDialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { downloadReplay, useReplayStore } from '@/replay/replayStore'
import { useBPStore } from '@/store/bpStore'

export default function ReplayPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const stored = useReplayStore((state) => state.replays.find((item) => item.replayId === id || item.metadata.matchId === id))
  const legacy = useBPStore((state) => state.recentMatches.find((item) => item.id === id && item.status === 'MATCH_FINISHED'))
  const replay = useMemo(() => stored ?? (legacy ? createReplayFromMatch(legacy, 'LOCAL') : null), [legacy, stored])
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!replay) return <div className="mx-auto max-w-3xl px-4 py-24 text-center"><p className="text-fog-300">没有找到这条复盘</p><Link to="/history" className="mt-4 inline-block text-blue-team-soft">返回比赛档案</Link></div>
  const ensureSaved = () => {
    if (!stored) useReplayStore.getState().save(replay)
    return replay
  }
  return <div className="mx-auto w-full max-w-6xl px-3 pb-16 sm:px-4">
    <div className="my-4 flex flex-wrap items-center justify-between gap-2">
      <Link to="/history" className="flex items-center gap-1 text-sm text-fog-400"><ArrowLeft size={15} /> 比赛档案</Link>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => downloadReplay(ensureSaved())} className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-xs text-fog-300"><Download size={13} /> 导出</button>
        <button type="button" onClick={() => { ensureSaved(); setShareOpen(true) }} className="flex items-center gap-1 rounded border border-blue-team/50 px-3 py-1.5 text-xs text-blue-team-soft"><Share2 size={13} /> 分享</button>
        {stored && <button type="button" aria-label="删除复盘" onClick={() => setDeleteOpen(true)} className="rounded border border-red-team/30 p-1.5 text-red-team-soft"><Trash2 size={14} /></button>}
      </div>
    </div>
    <ReplayViewer replay={replay} />
    <ShareReplayDialog replay={replay} open={shareOpen} onClose={() => setShareOpen(false)} />
    <ConfirmDialog open={deleteOpen} title="删除复盘？" message="只会删除这条 Replay，不会删除比赛历史或数据包。" danger confirmText="删除" onClose={() => setDeleteOpen(false)} onConfirm={() => { useReplayStore.getState().delete(replay.replayId); navigate('/history') }} />
  </div>
}
