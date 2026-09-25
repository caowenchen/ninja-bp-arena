import { useState } from 'react'
import { anonymizePlayerNames, createReplayBundle, type BPReplay } from '@bp-core'
import { Dialog } from '@/components/common/Dialog'
import { replayShareApi } from '@/replay/shareClient'
import { useReplayStore } from '@/replay/replayStore'
import { useOnlineRoomStore } from '@/online/onlineRoomStore'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from '@/store/toastStore'

export function ShareReplayDialog({ replay, open, onClose }: { replay: BPReplay; open: boolean; onClose: () => void }) {
  const [anonymized, setAnonymized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const ensureAuth = useOnlineRoomStore((state) => state.ensureAuth)
  const allShares = useReplayStore((state) => state.shares)
  const shares = allShares.filter((item) => item.replayId === replay.replayId)

  const publish = async () => {
    setBusy(true)
    try {
      if (!await ensureAuth()) throw new Error('匿名认证失败，请稍后再试')
      const shared = anonymized ? anonymizePlayerNames(replay) : replay
      const result = await replayShareApi.publish(createReplayBundle(shared), replay.metadata.roomId)
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const url = `${window.location.origin}${base}/share/${result.token}`
      setLink(url)
      useReplayStore.getState().rememberShare({ replayId: replay.replayId, token: result.token, url, createdAt: result.createdAt, anonymized, status: 'ACTIVE' })
      toast('只读分享链接已生成', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : '发布失败', 'error') }
    finally { setBusy(false) }
  }

  const revoke = async (token: string) => {
    setBusy(true)
    try {
      await replayShareApi.revoke(token)
      useReplayStore.getState().markShareRevoked(token)
      toast('分享链接已撤销', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : '撤销失败', 'error') }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onClose={onClose} title="生成只读分享链接" footer={!link ? <button type="button" disabled={busy} onClick={publish} className="rounded bg-blue-team px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '发布中…' : '确认发布'}</button> : undefined}>
    <div className="space-y-4 text-sm text-fog-300">
      <p className="rounded border border-gold-accent/30 bg-gold-accent/5 p-3 text-xs leading-relaxed">这是显式公开操作。玩家显示名会出现在任何拿到链接的人可访问的页面中；分享记录不是“官方”或“已验证”比赛。</p>
      <div className="rounded bg-ink-900/60 p-3"><span className="text-blue-team-soft">{anonymized ? 'BLUE' : replay.players.blue}</span> {replay.finalScore.blue}:{replay.finalScore.red} <span className="text-red-team-soft">{anonymized ? 'RED' : replay.players.red}</span></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={anonymized} onChange={(event) => setAnonymized(event.target.checked)} /> 匿名化玩家名为 BLUE / RED</label>
      {link && <div><label className="text-xs text-fog-500" htmlFor="share-link">分享链接</label><div className="mt-1 flex gap-2"><input id="share-link" readOnly value={link} className="min-w-0 flex-1 rounded border border-border-strong bg-ink-900 px-3 py-2 text-xs" /><button type="button" onClick={async () => toast(await copyToClipboard(link) ? '链接已复制' : '复制失败', 'success')} className="rounded border border-border-strong px-3 text-xs">复制</button></div></div>}
      {shares.length > 0 && <div className="space-y-2 border-t border-border-muted pt-3"><p className="text-xs font-bold text-fog-500">已生成链接</p>{shares.map((share) => <div key={share.token} className="flex items-center justify-between gap-2 text-xs"><span className={share.status === 'ACTIVE' ? 'text-emerald-400' : 'text-fog-600'}>{share.status === 'ACTIVE' ? '有效' : '已撤销'} · {new Date(share.createdAt).toLocaleString()}</span>{share.status === 'ACTIVE' && <button type="button" disabled={busy} onClick={() => void revoke(share.token)} className="text-red-team-soft underline">撤销</button>}</div>)}</div>}
    </div>
  </Dialog>
}
