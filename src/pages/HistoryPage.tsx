import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { createReplayFromMatch, validateReplayBundle, type BPReplay } from '@bp-core'
import { Dialog } from '@/components/common/Dialog'
import { useReplayStore } from '@/replay/replayStore'
import { useBPStore } from '@/store/bpStore'
import { formatDateTime } from '@/utils/format'
import { toast } from '@/store/toastStore'

type Filter = 'ALL' | 'LOCAL' | 'ONLINE' | 'COMPLETED'

export default function HistoryPage() {
  const replays = useReplayStore((state) => state.replays)
  const matches = useBPStore((state) => state.recentMatches)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [preview, setPreview] = useState<{ text: string; replay: BPReplay } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const all = useMemo(() => {
    const known = new Set(replays.map((item) => item.metadata.matchId))
    const legacy = matches.filter((match) => match.status === 'MATCH_FINISHED' && !known.has(match.id)).map((match) => createReplayFromMatch(match, 'LOCAL'))
    return [...replays, ...legacy].sort((a, b) => b.completedAt - a.completedAt)
  }, [matches, replays])
  const visible = useMemo(() => all.filter((item) => {
    const sourceMatch = filter === 'ALL' || filter === 'COMPLETED' || item.source === filter
    const text = `${item.players.blue} ${item.players.red} ${item.rule.name} ${formatDateTime(item.completedAt)}`.toLocaleLowerCase()
    return sourceMatch && text.includes(query.trim().toLocaleLowerCase())
  }), [all, filter, query])

  const inspectFile = async (file?: File) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast('复盘文件超过 2 MB 限制', 'error'); return }
    const text = await file.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { toast('JSON 格式无效', 'error'); return }
    const valid = validateReplayBundle(parsed)
    if (!valid.ok) { toast(valid.errors[0], 'error'); return }
    setPreview({ text, replay: (parsed as { replay: BPReplay }).replay })
    if (fileRef.current) fileRef.current.value = ''
  }

  return <div className="mx-auto w-full max-w-4xl px-4 pb-16">
    <div className="mt-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.25em] text-gold-accent">MATCH ARCHIVE</p><h1 className="mt-1 text-2xl font-black">比赛档案与复盘</h1></div><button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded border border-blue-team/50 px-3 py-2 text-xs text-blue-team-soft"><Upload size={14} /> 导入 Replay</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(event) => void inspectFile(event.target.files?.[0])} /></div>
    <div className="mt-6 flex flex-wrap gap-2"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索玩家、日期或规则" aria-label="搜索比赛档案" className="min-w-56 flex-1 rounded border border-border-strong bg-ink-900 px-3 py-2 text-sm" />{(['ALL','LOCAL','ONLINE','COMPLETED'] as const).map((item) => <button type="button" key={item} onClick={() => setFilter(item)} className={`rounded border px-3 py-2 text-xs ${filter === item ? 'border-blue-team bg-blue-team/10 text-blue-team-soft' : 'border-border-strong text-fog-400'}`}>{item === 'ALL' ? '全部' : item === 'LOCAL' ? '本地' : item === 'ONLINE' ? '在线' : '已完成'}</button>)}</div>
    <ul className="mt-4 divide-y divide-border-muted overflow-hidden rounded-lg border border-border-muted">
      {visible.map((item) => <li key={item.replayId} className="flex flex-wrap items-center gap-3 bg-surface-1/50 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm"><span className="text-blue-team-soft">{item.players.blue}</span> <strong className="mx-2">{item.finalScore.blue}:{item.finalScore.red}</strong> <span className="text-red-team-soft">{item.players.red}</span></p><p className="mt-1 text-[11px] text-fog-600">{formatDateTime(item.completedAt)} · {item.rule.name} · {item.source}{item.dataPackMetadata?.packVersion ? ` · Pack ${item.dataPackMetadata.packVersion}` : ''} · {item.winner} 胜</p></div><Link to={`/replay/${item.replayId}`} className="rounded bg-blue-team/15 px-3 py-1.5 text-xs font-bold text-blue-team-soft">复盘</Link></li>)}
      {!visible.length && <li className="p-10 text-center text-sm text-fog-600">没有匹配的比赛记录</li>}
    </ul>
    <Dialog open={!!preview} onClose={() => setPreview(null)} title="导入预览" footer={<><button type="button" onClick={() => setPreview(null)} className="px-3 py-2 text-sm text-fog-400">取消</button><button type="button" onClick={() => { if (!preview) return; const result = useReplayStore.getState().importText(preview.text); toast(result.ok ? '复盘已导入' : result.error, result.ok ? 'success' : 'error'); setPreview(null) }} className="rounded bg-blue-team px-4 py-2 text-sm font-bold text-white">确认导入</button></>}><p className="text-sm text-fog-300"><span className="text-blue-team-soft">{preview?.replay.players.blue}</span> {preview?.replay.finalScore.blue}:{preview?.replay.finalScore.red} <span className="text-red-team-soft">{preview?.replay.players.red}</span></p><p className="mt-2 text-xs text-fog-600">Schema v{preview?.replay.schemaVersion} · {preview?.replay.actions.length} 个时间轴事件</p></Dialog>
  </div>
}
