import { useMemo, useRef, useState } from 'react'
import { Copy, Download, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { Ninja, NinjaQuality } from '@/types/ninja'
import { useNinjaStore } from '@/store/ninjaStore'
import { useSettingsStore } from '@/store/settingsStore'
import { toast } from '@/store/toastStore'
import { NinjaAvatar } from '@/components/ninja/NinjaAvatar'
import { NinjaSearch } from '@/components/ninja/NinjaSearch'
import { NinjaFilter, type QualityFilter } from '@/components/ninja/NinjaFilter'
import { Dialog } from '@/components/common/Dialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { validateNinjaForm } from '@/engine/validators'
import { exportNinjaPoolJSON, parseNinjaImport } from '@/utils/importExport'
import { copyToClipboard, downloadTextFile } from '@/utils/clipboard'
import { normalizeForSearch } from '@/utils/format'

const QUALITY_ORDER = { S: 0, A: 1, B: 2, C: 3 } as const

interface FormState {
  id: string | null
  name: string
  quality: NinjaQuality
  avatar: string
  tags: string
  remark: string
  enabled: boolean
}

const EMPTY_FORM: FormState = { id: null, name: '', quality: 'A', avatar: '', tags: '', remark: '', enabled: true }

/** 忍者池管理：查看 / 搜索 / 增删改 / 启用禁用 / JSON 导入导出 */
export default function NinjaPoolPage() {
  const ninjas = useNinjaStore((s) => s.ninjas)
  const addNinja = useNinjaStore((s) => s.addNinja)
  const updateNinja = useNinjaStore((s) => s.updateNinja)
  const removeNinja = useNinjaStore((s) => s.removeNinja)
  const toggleEnabled = useNinjaStore((s) => s.toggleEnabled)
  const importNinjas = useNinjaStore((s) => s.importNinjas)
  const resetToDefault = useNinjaStore((s) => s.resetToDefault)
  const ninjaSort = useSettingsStore((s) => s.settings.ninjaSort)

  const [search, setSearch] = useState('')
  const [quality, setQuality] = useState<QualityFilter>('ALL')
  const [form, setForm] = useState<FormState | null>(null)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Ninja | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [importReport, setImportReport] = useState<{ added: number; updated: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const query = normalizeForSearch(search)
    let list = ninjas
    if (query) list = list.filter((n) => normalizeForSearch(n.name).includes(query))
    if (quality !== 'ALL') list = list.filter((n) => n.quality === quality)
    return [...list].sort((a, b) =>
      ninjaSort === 'name'
        ? a.name.localeCompare(b.name, 'zh-Hans-CN')
        : QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality] || a.name.localeCompare(b.name, 'zh-Hans-CN'),
    )
  }, [ninjas, search, quality, ninjaSort])

  const enabledCount = ninjas.filter((n) => n.enabled).length

  // ---- 表单提交 ----
  const handleSaveForm = () => {
    if (!form) return
    const tags = form.tags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
    const errors = validateNinjaForm({ name: form.name, quality: form.quality, avatar: form.avatar, tags })
    if (errors.length) {
      setFormErrors(errors)
      return
    }
    if (form.id) {
      updateNinja(form.id, { name: form.name.trim(), quality: form.quality, avatar: form.avatar.trim(), tags, remark: form.remark, enabled: form.enabled })
      toast('忍者已更新', 'success')
    } else {
      addNinja({ name: form.name.trim(), quality: form.quality, avatar: form.avatar.trim(), tags, remark: form.remark || '手动添加', enabled: form.enabled })
      toast('忍者已添加', 'success')
    }
    setForm(null)
    setFormErrors([])
  }

  // ---- 导入 ----
  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const report = parseNinjaImport(text)
    if (!report.ok) {
      setImportReport({ added: 0, updated: 0, errors: report.errors })
      return
    }
    const { added, updated } = importNinjas(report.ninjas)
    setImportReport({ added, updated, errors: [] })
  }

  const handleExport = () => {
    downloadTextFile('ninja-pool.json', exportNinjaPoolJSON(ninjas))
    toast('忍者池已导出为 ninja-pool.json', 'success')
  }

  const handleCopyPool = async () => {
    const ok = await copyToClipboard(exportNinjaPoolJSON(ninjas))
    toast(ok ? '忍者池 JSON 已复制' : '复制失败', ok ? 'success' : 'error')
  }

  const btnGhost = 'flex items-center gap-1.5 rounded-lg border border-ink-500 px-3 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16">
      <header className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-fog-100">忍者池管理</h1>
          <p className="mt-1 text-xs text-fog-600">
            共 {ninjas.length} 名忍者 · 启用 {enabledCount} 名
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setForm({ ...EMPTY_FORM }); setFormErrors([]) }} className="flex items-center gap-1.5 rounded-lg bg-side-blue px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-side-blue/85">
            <Plus size={14} /> 新增忍者
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={btnGhost}>
            <Upload size={14} /> 导入 JSON
          </button>
          <button type="button" onClick={handleExport} className={btnGhost}>
            <Download size={14} /> 导出
          </button>
          <button type="button" onClick={handleCopyPool} className={btnGhost}>
            <Copy size={14} /> 复制 JSON
          </button>
          <button type="button" onClick={() => setResetOpen(true)} className={btnGhost}>
            <RotateCcw size={14} /> 恢复示例池
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] leading-relaxed text-gold/90">
        当前为内置示例数据（品质与标签仅供演示），并非官方完整忍者名单。真实忍者池可通过「导入 JSON」批量导入，格式见 README。
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NinjaSearch value={search} onChange={setSearch} />
        <NinjaFilter value={quality} onChange={setQuality} />
      </div>

      {/* 列表 */}
      <ul className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-ink-500 py-10 text-center text-sm text-fog-600">
            没有找到符合条件的忍者，尝试修改搜索关键词或筛选条件
          </li>
        )}
        {filtered.map((ninja) => (
          <li key={ninja.id} className="flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-800/50 px-3 py-2.5">
            <NinjaAvatar name={ninja.name} avatar={ninja.avatar} className="h-11 w-11 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-fog-100">{ninja.name}</span>
                <span className="rounded border border-ink-500 bg-ink-700 px-1 text-[10px] font-bold text-fog-300">{ninja.quality}</span>
                {!ninja.enabled && <span className="rounded bg-ink-600 px-1.5 text-[10px] text-fog-500">已停用</span>}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-fog-600">
                {[ninja.tags.join(' / '), ninja.remark].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleEnabled(ninja.id)}
              role="switch"
              aria-checked={ninja.enabled}
              aria-label={`启用/停用 ${ninja.name}`}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${ninja.enabled ? 'bg-emerald-500/80' : 'bg-ink-500'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ninja.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <button
              type="button"
              onClick={() => { setForm({ id: ninja.id, name: ninja.name, quality: ninja.quality, avatar: ninja.avatar ?? '', tags: ninja.tags.join('、'), remark: ninja.remark ?? '', enabled: ninja.enabled }); setFormErrors([]) }}
              aria-label={`编辑 ${ninja.name}`}
              className="rounded-lg border border-ink-500 p-1.5 text-fog-400 transition-colors hover:bg-ink-600 hover:text-fog-100"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(ninja)}
              aria-label={`删除 ${ninja.name}`}
              className="rounded-lg border border-ink-500 p-1.5 text-fog-400 transition-colors hover:border-side-red/50 hover:text-side-red-soft"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      {/* 新增 / 编辑表单 */}
      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? '编辑忍者' : '新增忍者'}
        footer={
          <>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm text-fog-300 hover:bg-ink-600">
              取消
            </button>
            <button type="button" onClick={handleSaveForm} className="rounded-lg bg-side-blue px-5 py-2 text-sm font-bold text-white hover:bg-side-blue/85">
              保存
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            {formErrors.length > 0 && (
              <div className="rounded-lg border border-side-red/40 bg-side-red/10 p-2.5 text-xs text-side-red-soft">
                {formErrors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fog-300">忍者名称 *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={30}
                placeholder="例如：漩涡鸣人"
                className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-fog-100 focus:border-side-blue/60 focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fog-300">品质 *</span>
                <select
                  value={form.quality}
                  onChange={(e) => setForm({ ...form, quality: e.target.value as NinjaQuality })}
                  className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-fog-100 focus:border-side-blue/60 focus:outline-none"
                >
                  {(['S', 'A', 'B', 'C'] as const).map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fog-300">标签（逗号分隔）</span>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="近战, 突进"
                  className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-fog-100 focus:border-side-blue/60 focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fog-300">头像 URL（留空显示占位头像）</span>
              <input
                type="url"
                value={form.avatar}
                onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                placeholder="https://…"
                className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-fog-100 focus:border-side-blue/60 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fog-300">备注</span>
              <input
                type="text"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                className="rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-fog-100 focus:border-side-blue/60 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-4 w-4 accent-[#4d8dff]"
              />
              <span className="text-xs text-fog-300">启用（停用后 BP 中不可选择）</span>
            </label>
          </div>
        )}
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="删除忍者"
        message={`确认删除“${deleteTarget?.name}”？该操作不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            removeNinja(deleteTarget.id)
            toast('已删除', 'success')
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />

      {/* 恢复示例池确认 */}
      <ConfirmDialog
        open={resetOpen}
        title="恢复默认忍者池？"
        message="当前全部忍者数据将被覆盖为内置示例池（可在操作前先导出备份）。"
        confirmText="恢复"
        danger
        onConfirm={() => {
          resetToDefault()
          toast('已恢复内置示例忍者池', 'success')
        }}
        onClose={() => setResetOpen(false)}
      />

      {/* 导入结果 */}
      <Dialog open={!!importReport} onClose={() => setImportReport(null)} title="导入结果">
        {importReport && (
          <div className="space-y-3 text-sm">
            {importReport.errors.length === 0 ? (
              <p className="text-emerald-300">
                导入成功：新增 {importReport.added} 名，更新 {importReport.updated} 名。
              </p>
            ) : (
              <>
                <p className="text-side-red-soft">导入失败或部分失败：</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-side-red/30 bg-side-red/5 p-2.5 text-xs text-side-red-soft">
                  {importReport.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setImportReport(null)} className="rounded-lg bg-ink-600 px-4 py-2 text-xs text-fog-100 hover:bg-ink-500">
                知道了
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
