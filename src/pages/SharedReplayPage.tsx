import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { validateReplayBundle, type BPReplay } from '@bp-core'
import { ReplayViewer } from '@/components/replay/ReplayViewer'
import { replayShareApi } from '@/replay/shareClient'

export default function SharedReplayPage() {
  const { token = '' } = useParams()
  const [replay, setReplay] = useState<BPReplay | null>(null)
  const [status, setStatus] = useState<'LOADING'|'NOT_FOUND'|'REVOKED'|'ERROR'>('LOADING')
  useEffect(() => {
    let active = true
    void replayShareApi.fetch(token).then((result) => {
      const validation = validateReplayBundle({ bundleVersion: 1, replay: result.replay, checksum: result.checksum })
      if (!validation.ok) throw new Error('复盘数据损坏')
      const shared = { ...result.replay, source: 'SHARED' as const, metadata: { ...result.replay.metadata, originalSource: result.replay.source } }
      if (active) setReplay(shared)
    }).catch((error: { code?: string }) => { if (active) setStatus(error.code === 'SHARE_REVOKED' ? 'REVOKED' : error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR') })
    return () => { active = false }
  }, [token])
  if (!replay) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-xl font-bold">{status === 'LOADING' ? '正在加载分享…' : status === 'REVOKED' ? '该分享已失效' : status === 'NOT_FOUND' ? '没有找到该分享' : '无法加载分享'}</h1><p className="mt-2 text-sm text-fog-600">用户分享的 BP 记录，不代表官方认证或比赛真实性。</p><Link to="/" className="mt-5 inline-block text-blue-team-soft">返回首页</Link></div>
  return <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-4"><ReplayViewer replay={replay} shared /><p className="mt-4 text-center text-xs text-fog-600">用户分享的 BP 记录 · 只读 · 不代表官方认证</p></div>
}
