import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Database,
  Download,
  FileJson,
  Globe,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import type { DataPackDiff, InstalledDataPack } from '@bp-core'
import { getMinimumRequiredPoolSize } from '@bp-core'
import { acknowledgeBuiltinVersion, useDataPackStore } from '@/dataPack/store'
import { BUILT_IN_PACK_ID, DATA_PACK_CSV_HEADERS } from '@/dataPack/types'
import { builtInPack } from '@/dataPack/loader'
import {
  computeDataHealth,
  diffPacks,
  exportDataPackBundle,
  exportNinjasCsv,
  parseDataPackBundle,
  parseNinjasCsv,
  summarizeDiff,
  type DataHealth,
} from '@/dataPack/service'
import { useNinjaStore } from '@/store/ninjaStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useBPStore } from '@/store/bpStore'
import { DEFAULT_RULE } from '@/data/defaultRules'
import { downloadTextFile } from '@/utils/clipboard'
import { fileTimestamp } from '@/utils/format'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Dialog } from '@/components/common/Dialog'
import { toast } from '@/store/toastStore'
import { resolveAsset } from '@/dataPack/assetResolver'

/**
 * /data —— 数据包管理页。
 * 显示当前数据包状态 / 数据来源 / 数据健康 / 容量需求，
 * 提供检查更新（远程包）、导入导出、切换与恢复默认。
 * 更新永远先预览 Diff，由用户确认后才应用（绝不自动覆盖）。
 */

const SOURCE_LABEL: Record<string, string> = {
  BUILT_IN: '本地内置（示例数据）',
  REMOTE_PACK: '远程数据包',
  CUSTOM: '用户自定义',
}

const FIELD_LABEL: Record<string, string> = {
  name: '名称',
  aliases: '别名',
  quality: '品质',
  tags: '标签',
  enabled: '启用',
  sortOrder: '排序',
  slug: 'slug',
  series: '系列',
  forms: '形态',
  roles: '定位',
  rarityLabel: '品质显示名',
  assetKey: '素材键',
  avatar: '头像',
  deprecated: '下架',
  releaseDate: '发布时间',
  dataVersion: '数据版本',
}

export default function DataPackPage() {
  const navigate = useNavigate()
  const installedPacks = useDataPackStore((s) => s.installedPacks)
  const customPool = useDataPackStore((s) => s.customPool)
  const activePackId = useDataPackStore((s) => s.activePackId)
  const updateState = useDataPackStore((s) => s.updateState)
  const activatePack = useDataPackStore((s) => s.activatePack)
  const removePack = useDataPackStore((s) => s.removePack)
  const setAutoCheckEnabled = useDataPackStore((s) => s.setAutoCheckEnabled)
  const installPack = useDataPackStore((s) => s.installPack)
  const setAuxResourceEnabled = useDataPackStore((s) => s.setAuxResourceEnabled)

  const ninjas = useNinjaStore((s) => s.ninjas)
  const poolSource = useDataPackStore((s) => s.poolSource())
  // 不在 Zustand selector 内调用 activePack()：内置包会构造新对象，导致
  // useSyncExternalStore 认为快照持续变化并触发无限更新。
  const activePack = useMemo(() => {
    if (activePackId === 'CUSTOM') return null
    if (activePackId === BUILT_IN_PACK_ID) return builtInPack()
    return installedPacks.find((pack) => pack.manifest.id === activePackId) ?? null
  }, [activePackId, installedPacks])
  const customRule = useSettingsStore((s) => s.customRule)
  const rule = customRule ?? DEFAULT_RULE

  const [importOpen, setImportOpen] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [pendingDiff, setPendingDiff] = useState<{ pack: InstalledDataPack; diff: DataPackDiff; addedIds: string[] } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceTab, setResourceTab] = useState<'SECRET_SCROLL' | 'SUMMON'>('SECRET_SCROLL')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // 进入管理页即视为用户已经查看内置包更新，首页不再反复提示。
  useEffect(() => acknowledgeBuiltinVersion(), [])

  const health: DataHealth = useMemo(() => computeDataHealth(ninjas), [ninjas])
  const required = getMinimumRequiredPoolSize(rule)
  const available = useMemo(() => new Set(ninjas.filter((n) => n.enabled && !n.deprecated).map((n) => n.id)).size, [ninjas])
  const dataStatus = activePack?.manifest.dataStatus ?? 'COMMUNITY'
  const assetHealth = useMemo(() => {
    if (!activePack) return { available: 0, fallback: ninjas.length }
    const resources = [...activePack.ninjas, ...activePack.secretScrolls, ...activePack.summons]
    const statuses = resources.map((resource) => resolveAsset(resource, { packManifest: activePack.manifest }))
    return { available: statuses.filter((item) => item.url).length, fallback: statuses.filter((item) => !item.url).length }
  }, [activePack, ninjas.length])

  const notifyNextMatchOnly = () => {
    const match = useBPStore.getState().match
    if (match && match.status !== 'MATCH_FINISHED') {
      toast('数据包已切换；正在进行的比赛仍使用创建时快照，新数据只用于下一场比赛', 'info')
    }
  }

  const activateWithNotice = (id: string) => {
    activatePack(id)
    notifyNextMatchOnly()
  }

  // 数据包导入（单 JSON Bundle）
  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const parsed = await parseDataPackBundle(text)
    if (!parsed.ok || !parsed.manifest || !parsed.ninjas) {
      toast(parsed.errors[0] ?? '数据包校验失败', 'error')
      return
    }
    const pack = {
      manifest: parsed.manifest,
      ninjas: parsed.ninjas,
      secretScrolls: parsed.secretScrolls ?? [],
      summons: parsed.summons ?? [],
      origin: 'FILE' as const,
      installedAt: new Date().toISOString(),
    }
    const diff = diffPacks({ ninjas, secretScrolls: activePack?.secretScrolls ?? [], summons: activePack?.summons ?? [] }, pack)
    // 与其它安装包比较（同 ID 覆盖）；激活决策交给用户在预览后确认
    setPendingDiff({ pack, diff, addedIds: diff.added.map((n) => n.id) })
  }

  // 远程检查更新
  const handleCheckUpdate = async () => {
    if (!remoteUrl.trim()) {
      toast('请先填写 manifest 地址', 'error')
      return
    }
    setChecking(true)
    const result = await useDataPackStore.getState().checkRemoteUpdate(remoteUrl.trim(), { force: true })
    setChecking(false)
    if (result.status === 'NEWER') {
      const prepared = await useDataPackStore.getState().prepareRemoteUpdate(remoteUrl.trim())
      if (prepared.ok) {
        const current = useDataPackStore.getState().activePack()
        const diff = diffPacks({ ninjas: useNinjaStore.getState().ninjas, secretScrolls: current?.secretScrolls ?? [], summons: current?.summons ?? [] }, prepared.pack)
        setPendingDiff({ pack: prepared.pack, diff, addedIds: prepared.addedIds })
      } else {
        toast(prepared.message, 'error')
      }
    } else if (result.status === 'UP_TO_DATE') {
      toast('当前已是最新版本', 'success')
    } else if (result.status === 'OLD') {
      toast('远程版本不比当前新（可手动导入旧包）', 'info')
    } else {
      toast(result.message, 'error')
    }
  }

  const handleExportBundle = async () => {
    const source = activePack ?? { manifest: { id: 'custom', name: '自定义忍者数据', schemaVersion: 2, version: 'local', updatedAt: new Date().toISOString(), ninjaCount: ninjas.length, secretScrollCount: 0, summonCount: 0 }, ninjas, secretScrolls: [], summons: [] }
    const text = await exportDataPackBundle(source)
    downloadTextFile(`ninja-data-pack-${fileTimestamp(Date.now())}.json`, text)
    toast('数据包 JSON 已导出', 'success')
  }

  const handleExportCsv = () => {
    downloadTextFile(`ninjas-${fileTimestamp(Date.now())}.csv`, exportNinjasCsv(ninjas))
    toast('CSV 已导出（aliases / tags 用 | 分隔）', 'success')
  }

  const handleImportCsv = async (file: File) => {
    const text = await file.text()
    const parsed = parseNinjasCsv(text)
    if (!parsed.ok) {
      toast(parsed.errors[0] ?? 'CSV 校验失败', 'error')
      return
    }
    installPack(
      {
        manifest: {
          schemaVersion: 2,
          id: `custom-${Date.now().toString(36)}`,
          name: `自定义数据（${file.name}）`,
          version: 'csv-1',
          updatedAt: new Date().toISOString(),
          ninjaCount: parsed.ninjas.length,
          secretScrollCount: 0,
          summonCount: 0,
          description: '由 CSV 导入生成的自定义数据包',
        },
        ninjas: parsed.ninjas,
        secretScrolls: [],
        summons: [],
        origin: 'FILE',
        installedAt: new Date().toISOString(),
      },
      { activate: true },
    )
    notifyNextMatchOnly()
    toast(`已导入 ${parsed.ninjas.length} 名忍者并启用该数据包`, 'success')
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      <header className="mt-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-fog-100">
          <Database size={20} /> 数据包管理
        </h1>
        <p className="mt-1 text-xs text-fog-600">
          忍者数据与素材解耦：数据包只含纯数据，头像素材可选。角色图片由当前素材源提供；请仅使用你有权使用的素材。
        </p>
      </header>

      {/* 当前数据包状态卡 */}
      <section className="mt-4 rounded-lg border border-border-muted bg-surface-1/50 p-5">
        {dataStatus === 'DEMO' && (
          <div data-testid="demo-status" className="mb-4 rounded border border-gold-accent/35 bg-gold-accent/10 px-3 py-2 text-xs text-gold-accent">
            <strong>DEMO 示例数据</strong> · 当前并非完整游戏名单，请勿视为官方认证数据。
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-fog-100">{activePack?.manifest.name ?? '自定义忍者数据'}</h2>
            <p className="mt-1 text-xs text-fog-500">
              {activePack ? `v${activePack.manifest.version}` : '未绑定数据包'} · {health.total} 名忍者 · {activePack?.secretScrolls.length ?? 0} 个秘卷 · {activePack?.summons.length ?? 0} 个通灵
              {activePack ? ` · ${new Date(activePack.manifest.updatedAt).toLocaleDateString()}` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-fog-600">
              来源：{SOURCE_LABEL[poolSource]}
              {activePack?.origin === 'URL' && activePack.remoteUrl ? '（远程）' : activePack?.origin === 'FILE' ? '（文件导入）' : ''}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="rounded border border-border-muted p-2"><span className="block text-fog-600">Data Status</span><strong className="text-fog-100">{dataStatus}</strong></div>
              <div className="rounded border border-border-muted p-2"><span className="block text-fog-600">Version</span><strong className="text-fog-100">{activePack?.manifest.version ?? 'local'}</strong></div>
              <div className="rounded border border-border-muted p-2"><span className="block text-fog-600">Updated</span><strong className="text-fog-100">{activePack ? new Date(activePack.manifest.updatedAt).toLocaleDateString() : '本地'}</strong></div>
              <div className="rounded border border-border-muted p-2"><span className="block text-fog-600">Asset Status</span><strong className="text-fog-100">{assetHealth.available} 可用 / {assetHealth.fallback} 占位</strong></div>
            </div>
            {activePack?.manifest.sources?.length ? (
              <div className="mt-3 text-[11px] text-fog-500">
                <span className="font-semibold text-fog-300">Sources：</span>
                {activePack.manifest.sources.map((source) => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="ml-2 underline hover:text-fog-100">{source.label}</a> : <span key={source.id} className="ml-2">{source.label}</span>)}
              </div>
            ) : null}
            <p className={`mt-1 flex items-center gap-1 text-xs ${health.ok ? 'text-emerald-400' : 'text-gold-accent'}`}>
              {health.ok ? <CheckCircle2 size={13} /> : null} {health.ok ? '数据完整' : `存在 ${health.duplicateIds.length + health.missingName} 条数据问题`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-xs text-fog-300 hover:bg-surface-2">
              <Upload size={13} /> 导入数据包
            </button>
            <button type="button" onClick={() => void handleExportBundle()} className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-xs text-fog-300 hover:bg-surface-2">
              <Download size={13} /> 导出 JSON
            </button>
            <button type="button" onClick={handleExportCsv} className="flex items-center gap-1 rounded border border-border-strong px-3 py-1.5 text-xs text-fog-300 hover:bg-surface-2">
              <Download size={13} /> 导出 CSV
            </button>
            {activePackId !== BUILT_IN_PACK_ID && (
              <button
                type="button"
                onClick={() => {
                  activateWithNotice(BUILT_IN_PACK_ID)
                  toast('已恢复为内置示例数据包', 'success')
                }}
                className="flex items-center gap-1 rounded border border-gold-accent/40 px-3 py-1.5 text-xs text-gold-accent hover:bg-gold-accent/10"
              >
                <RotateCcw size={13} /> 恢复默认
              </button>
            )}
          </div>
        </div>

        {/* 容量需求 */}
        <p className="mt-3 border-t border-border-muted pt-2 text-xs text-fog-500">
          当前规则（{rule.name}）完成整场比赛至少需要 <span className="font-bold text-fog-200">{required}</span> 名可用忍者，
          当前可用 <span className={`font-bold ${available >= required ? 'text-emerald-400' : 'text-red-team-soft'}`}>{available}</span> 名。
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-border-muted bg-surface-1/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-fog-100">辅助资源（Demo / 数据包内容）</h2>
            <p className="mt-1 text-[11px] text-fog-600">可查看、搜索并启用/停用秘卷与通灵；修改内置包时会生成本地副本。</p>
          </div>
          <input value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder="搜索名称、别名或标签" className="rounded border border-ink-500 bg-ink-900 px-3 py-1.5 text-xs text-fog-100" />
        </div>
        <div className="mt-3 flex gap-2">
          {(['SECRET_SCROLL', 'SUMMON'] as const).map((type) => (
            <button key={type} type="button" aria-pressed={resourceTab === type} onClick={() => setResourceTab(type)} className={`rounded px-3 py-1.5 text-xs ${resourceTab === type ? 'bg-gold-accent text-ink-950' : 'border border-ink-500 text-fog-400'}`}>
              {type === 'SECRET_SCROLL' ? `秘卷 ${activePack?.secretScrolls.length ?? 0}` : `通灵 ${activePack?.summons.length ?? 0}`}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(resourceTab === 'SECRET_SCROLL' ? activePack?.secretScrolls ?? [] : activePack?.summons ?? [])
            .filter((item) => !resourceSearch.trim() || [item.name, ...(item.aliases ?? []), ...(item.tags ?? [])].join(' ').toLocaleLowerCase().includes(resourceSearch.trim().toLocaleLowerCase()))
            .map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/60 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-fog-200">{item.name}</p>
                  <p className="truncate text-[10px] text-fog-600">{item.id} · {(item.tags ?? []).join(' / ') || '无标签'}</p>
                </div>
                <button type="button" aria-label={`${item.enabled ? '停用' : '启用'} ${item.name}`} onClick={() => {
                  if (setAuxResourceEnabled(resourceTab, item.id, !item.enabled)) toast(`${item.name} 已${item.enabled ? '停用' : '启用'}`, 'success')
                }} className={`shrink-0 rounded px-2 py-1 text-[10px] ${item.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-ink-600 text-fog-500'}`}>
                  {item.enabled ? '已启用' : '已停用'}
                </button>
              </div>
            ))}
        </div>
      </section>

      {/* 数据健康（真实计数） */}
      <section className="mt-4 rounded-lg border border-border-muted bg-surface-1/50 p-5">
        <h2 className="text-sm font-bold text-fog-100">数据健康</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[
            ['重复 ID', health.duplicateIds.length, health.duplicateIds.length > 0],
            ['缺名称', health.missingName, health.missingName > 0],
            ['无图片', health.noImage, false],
            ['已下架', health.deprecated, false],
            ['已停用', health.disabled, false],
          ].map(([label, count, problem]) => (
            <div key={label as string} className={`rounded border p-2 text-center ${problem ? 'border-gold-accent/40 bg-gold-accent/5 text-gold-accent' : 'border-border-muted text-fog-400'}`}>
              <p className="text-base font-bold">{count as number}</p>
              <p className="text-[10px]">{label as string}</p>
            </div>
          ))}
        </div>
        {health.duplicateIds.length > 0 && (
          <p className="mt-2 text-[11px] text-gold-accent">重复 ID：{health.duplicateIds.slice(0, 5).join('、')}{health.duplicateIds.length > 5 ? ' …' : ''}</p>
        )}
      </section>

      {/* 远程更新检查 */}
      <section className="mt-4 rounded-lg border border-border-muted bg-surface-1/50 p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-fog-100">
          <Globe size={15} /> 远程数据包
        </h2>
        <p className="mt-1 text-xs text-fog-600">
          填入 manifest.json 地址；v2 的 ninjas.json、secret-scrolls.json、summons.json 需同目录（v1 只需 ninjas.json）。
          只支持 https；自动检查每天最多一次，发现更新后由你确认是否应用。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="url"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder="https://example.com/ninja-pack/manifest.json"
            className="flex-1 rounded border border-border-strong bg-ink-900 px-3 py-2 text-xs text-fog-100 focus:border-blue-team/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleCheckUpdate()}
            disabled={checking}
            className="flex items-center gap-1 rounded bg-blue-team px-3 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> {checking ? '检查中……' : '检查更新'}
          </button>
        </div>
        {Object.values(updateState.remotes).some((r) => r.pending) && (
          <p className="mt-2 rounded border border-gold-accent/40 bg-gold-accent/10 p-2 text-xs text-gold-accent">
            发现数据包更新，请在对应数据包上查看并应用。
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-fog-400">
          <input
            type="checkbox"
            checked={updateState.autoCheckEnabled}
            onChange={(e) => setAutoCheckEnabled(e.target.checked)}
            className="accent-blue-team"
          />
          自动检查更新（每天最多一次；只提示，不自动修改数据）
        </label>
      </section>

      {/* 已安装数据包列表 */}
      <section className="mt-4 rounded-lg border border-border-muted bg-surface-1/50 p-5">
        <h2 className="text-sm font-bold text-fog-100">已安装的数据包</h2>
        <div className="mt-3 space-y-2">
          <PackRow
            active={activePackId === BUILT_IN_PACK_ID}
            title={builtInPack().manifest.name}
            subtitle={`v${builtInPack().manifest.version} · ${builtInPack().ninjas.length} 忍者 / ${builtInPack().secretScrolls.length} 秘卷 / ${builtInPack().summons.length} 通灵 · 本地内置`}
            onActivate={() => activateWithNotice(BUILT_IN_PACK_ID)}
          />
          {customPool && (
            <PackRow
              active={activePackId === 'CUSTOM'}
              title="用户自定义数据"
              subtitle={`${customPool.length} 名 · 本地保留`}
              onActivate={() => activateWithNotice('CUSTOM')}
            />
          )}
          {installedPacks.map((pack) => (
            <PackRow
              key={pack.manifest.id}
              active={activePackId === pack.manifest.id}
              title={pack.manifest.name}
              subtitle={`v${pack.manifest.version} · ${pack.ninjas.length} 忍者 / ${pack.secretScrolls.length} 秘卷 / ${pack.summons.length} 通灵 · ${pack.origin === 'URL' ? '远程' : '文件导入'}`}
              onActivate={() => activateWithNotice(pack.manifest.id)}
              onRemove={pack.manifest.id !== BUILT_IN_PACK_ID ? () => setRemoveTarget(pack.manifest.id) : undefined}
            />
          ))}
        </div>
      </section>

      {/* 隐藏文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
          e.target.value = ''
        }}
      />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportCsv(file)
          e.target.value = ''
        }}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!removeTarget}
        title="删除数据包？"
        message="删除后无法直接切回；历史比赛使用快照与回退名显示，不受影响。"
        confirmText="删除"
        danger
        onConfirm={() => {
          if (!removeTarget) return
          const result = removePack(removeTarget)
          toast(result.ok ? '数据包已删除' : result.error ?? '删除失败', result.ok ? 'success' : 'error')
          setRemoveTarget(null)
        }}
        onClose={() => setRemoveTarget(null)}
      />

      {/* 导入方式选择 */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="导入数据包">
        <div className="space-y-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setImportOpen(false)
              fileInputRef.current?.click()
            }}
            className="flex w-full items-center gap-2 rounded border border-border-strong px-4 py-3 text-left text-xs hover:bg-surface-2"
          >
            <FileJson size={16} className="text-gold-accent" />
            <span>
              <span className="block font-bold text-fog-100">JSON Bundle（推荐）</span>
              <span className="text-fog-600">{"{ manifest, ninjas }"} 单文件，完整校验后预览应用</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setImportOpen(false)
              csvInputRef.current?.click()
            }}
            className="flex w-full items-center gap-2 rounded border border-border-strong px-4 py-3 text-left text-xs hover:bg-surface-2"
          >
            <FileJson size={16} className="text-emerald-400" />
            <span>
              <span className="block font-bold text-fog-100">CSV（Excel 编辑友好）</span>
              <span className="text-fog-600">{DATA_PACK_CSV_HEADERS.join(' / ')}（aliases / tags 用 | 分隔）</span>
            </span>
          </button>
        </div>
      </Dialog>

      {/* 更新 / 导入预览 */}
      {pendingDiff && (
        <DiffPreviewDialog
          pending={pendingDiff}
          onClose={() => setPendingDiff(null)}
          onConfirm={() => {
            installPack(pendingDiff.pack, { activate: true })
            notifyNextMatchOnly()
            if (pendingDiff.addedIds.length > 0) {
              useDataPackStore.setState((s) => ({
                updateState: {
                  ...s.updateState,
                  newNinjaBadge: { appliedAt: new Date().toISOString(), ids: pendingDiff.addedIds },
                },
              }))
            }
            toast(
              `已应用「${pendingDiff.pack.manifest.name}」v${pendingDiff.pack.manifest.version}：新增 ${pendingDiff.diff.added.length} · 修改 ${pendingDiff.diff.updated.length} · 移除 ${pendingDiff.diff.removed.length}`,
              'success',
            )
            setPendingDiff(null)
            navigate('/ninjas')
          }}
        />
      )}
    </div>
  )
}

function PackRow({ active, title, subtitle, onActivate, onRemove }: {
  active: boolean
  title: string
  subtitle: string
  onActivate: () => void
  onRemove?: () => void
}) {
  return (
    <div className={`flex items-center justify-between rounded border px-3 py-2 ${active ? 'border-blue-team/50 bg-blue-team/5' : 'border-border-muted'}`}>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-fog-100">
          {title}
          {active && <span className="ml-2 rounded bg-blue-team/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-team-soft">使用中</span>}
        </p>
        <p className="text-[10px] text-fog-600">{subtitle}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {!active && (
          <button type="button" onClick={onActivate} className="rounded border border-border-strong px-2 py-1 text-[10px] text-fog-300 hover:bg-surface-2">
            启用
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="删除数据包" className="rounded border border-red-team/40 p-1 text-red-team-soft hover:bg-red-team/10">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/** 更新 / 导入预览：版本对比 + Diff 统计 + 可展开明细（ID 相同但名称完全不同的条目特别提示） */
function DiffPreviewDialog({ pending, onClose, onConfirm }: {
  pending: { pack: InstalledDataPack; diff: DataPackDiff; addedIds: string[] }
  onClose: () => void
  onConfirm: () => void
}) {
  const { pack, diff } = pending
  const summary = summarizeDiff(diff)
  const [expanded, setExpanded] = useState(false)
  const nameConflicts = diff.updated.filter((u) => u.changedFields.some((f) => f.field === 'name'))

  return (
    <Dialog open onClose={onClose} title="数据包更新预览" wide>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-fog-400">
          {pack.manifest.name} · 当前版本 → 新版本{' '}
          <span className="font-bold text-fog-100">v{pack.manifest.version}</span>
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">新增 {summary.added}</span>
          <span className="rounded bg-sky-500/15 px-2 py-1 text-sky-300">修改 {summary.updated}</span>
          <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">停用 {summary.disabled}</span>
          <span className="rounded bg-red-500/15 px-2 py-1 text-red-300">移除 {summary.removed}</span>
          <span className="rounded bg-ink-600 px-2 py-1 text-fog-400">无变化 {diff.unchanged.length}</span>
        </div>
        {diff.resources && (
          <div className="grid gap-1 rounded border border-ink-600 p-2 text-[11px] text-fog-400 sm:grid-cols-3">
            {([
              ['忍者', diff.resources.ninjas],
              ['秘卷', diff.resources.secretScrolls],
              ['通灵', diff.resources.summons],
            ] as const).map(([label, item]) => (
              <p key={label}><span className="font-bold text-fog-200">{label}</span>：新增 {item.added.length} / 修改 {item.updated.length} / 停用 {item.updated.filter((entry) => entry.changedFields.some((field) => field.field === 'enabled' && field.after === false)).length} / 移除 {item.removed.length}</p>
            ))}
          </div>
        )}
        {nameConflicts.length > 0 && (
          <p className="rounded border border-gold-accent/40 bg-gold-accent/10 p-2 text-xs text-gold-accent">
            有 {nameConflicts.length} 个 ID 相同但名称不同的条目（如 {nameConflicts[0].name}），请确认是同一名角色的数据更新。
          </p>
        )}
        {diff.removed.length > 0 && (
          <p className="rounded border border-red-team/40 bg-red-team/10 p-2 text-xs text-red-team-soft">
            移除的角色将从池中消失；历史比赛仍按快照 / 回退名显示。
          </p>
        )}
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-blue-team-soft underline underline-offset-2">
          {expanded ? '收起明细' : '展开查看具体变化'}
        </button>
        {expanded && (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded border border-border-muted p-2 text-xs">
            {diff.added.length > 0 && (
              <div>
                <p className="font-bold text-emerald-300">新增</p>
                {diff.added.map((n) => <p key={n.id} className="text-fog-400">+ {n.name}（{n.id}）</p>)}
              </div>
            )}
            {diff.updated.map((u) => (
              <div key={u.id}>
                <p className="font-bold text-sky-300">~ {u.name}（{u.id}）</p>
                {u.changedFields.map((f) => (
                  <p key={f.field} className="pl-3 text-fog-500">
                    {FIELD_LABEL[f.field] ?? f.field}：{JSON.stringify(f.before) ?? '—'} → {JSON.stringify(f.after)}
                  </p>
                ))}
              </div>
            ))}
            {diff.removed.length > 0 && (
              <div>
                <p className="font-bold text-red-300">移除</p>
                {diff.removed.map((n) => <p key={n.id} className="text-fog-400">- {n.name}（{n.id}）</p>)}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-xs text-fog-300 hover:bg-ink-600">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="rounded bg-blue-team px-4 py-2 text-xs font-bold text-white hover:brightness-110">
            应用更新
          </button>
        </div>
      </div>
    </Dialog>
  )
}
