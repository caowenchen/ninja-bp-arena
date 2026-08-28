import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import type { BattleRule } from '@/types/bp'
import { DEFAULT_RULE, cloneRule } from '@/data/defaultRules'
import { describeSequence, parseSequenceSteps, validateBattleRule } from '@/engine/ruleEngine'
import { useSettingsStore } from '@/store/settingsStore'
import { useNinjaStore } from '@/store/ninjaStore'
import { toast } from '@/store/toastStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

const TIMER_PRESETS = [15, 30, 45, 60, 90] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-600 bg-ink-800/50 p-5">
      <h2 className="mb-4 text-sm font-bold tracking-wide text-fog-100">{title}</h2>
      {children}
    </section>
  )
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-fog-100">{label}</span>
        {desc && <span className="mt-0.5 block text-xs text-fog-600">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5.5 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-side-blue' : 'bg-ink-500'}`}
      >
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export default function SettingsPage() {
  const customRule = useSettingsStore((s) => s.customRule)
  const saveCustomRule = useSettingsStore((s) => s.saveCustomRule)
  const resetCustomRule = useSettingsStore((s) => s.resetCustomRule)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  const [draft, setDraft] = useState<BattleRule>(() => cloneRule(customRule ?? DEFAULT_RULE))
  const [banText, setBanText] = useState(() => JSON.stringify((customRule ?? DEFAULT_RULE).banSequence, null, 2))
  const [pickText, setPickText] = useState(() => JSON.stringify((customRule ?? DEFAULT_RULE).pickSequence, null, 2))
  const [errors, setErrors] = useState<string[]>([])
  const [resetRuleOpen, setResetRuleOpen] = useState(false)
  const [resetPoolOpen, setResetPoolOpen] = useState(false)
  const resetNinjaPool = useNinjaStore((s) => s.resetToDefault)

  const preview = useMemo(() => {
    const ban = describeSequence(draft.banSequence)
    const pick = describeSequence(draft.pickSequence)
    return { ban, pick }
  }, [draft])

  const handleSaveRule = () => {
    const ban = parseSequenceSteps(safeParse(banText), 'banSequence', 'BAN')
    const pick = parseSequenceSteps(safeParse(pickText), 'pickSequence', 'PICK')
    const allErrors = [...ban.errors, ...pick.errors]
    if (ban.steps) draft.banSequence = ban.steps
    if (pick.steps) draft.pickSequence = pick.steps
    if (allErrors.length === 0) {
      allErrors.push(...validateBattleRule(draft))
    }
    if (allErrors.length > 0) {
      setErrors(allErrors)
      toast('规则校验未通过，请检查后重试', 'error')
      return
    }
    setErrors([])
    saveCustomRule(cloneRule(draft))
    toast('规则模板已保存，将应用于之后新开的比赛', 'success')
  }

  const handleRestoreDefault = () => {
    resetCustomRule()
    setDraft(cloneRule(DEFAULT_RULE))
    setBanText(JSON.stringify(DEFAULT_RULE.banSequence, null, 2))
    setPickText(JSON.stringify(DEFAULT_RULE.pickSequence, null, 2))
    setErrors([])
    toast('已恢复默认规则模板', 'success')
  }

  const timerSelectValue = !draft.timerEnabled ? 'off' : TIMER_PRESETS.includes(draft.timerSeconds as (typeof TIMER_PRESETS)[number]) ? String(draft.timerSeconds) : 'custom'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-16">
      <header className="mt-6">
        <h1 className="text-xl font-bold text-fog-100">规则设置</h1>
        <p className="mt-1 text-xs text-fog-600">
          规则模板可以自由修改，当前默认仅为「武斗赛 BO3」参考模板，不代表官方最新规则。修改只影响之后新开的比赛，进行中的比赛沿用开赛时的规则。
        </p>
      </header>

      {/* 比赛规则 */}
      <Section title={`比赛规则 · ${customRule?.name ?? '武斗赛 BO3 默认模板'}`}>
        <div className="divide-y divide-ink-700">
          <Toggle
            label="Ban 仅在第一局进行"
            desc="关闭后，后续每一局都会重新执行 Ban 序列"
            checked={draft.banOnlyFirstGame}
            onChange={(v) => setDraft({ ...draft, banOnlyFirstGame: v })}
          />
          <Toggle
            label="Ban 跨局持续生效"
            desc="关闭后，每局的 Ban 只在本局内有效"
            checked={draft.banPersistence}
            onChange={(v) => setDraft({ ...draft, banPersistence: v })}
          />
          <Toggle
            label="已出场忍者整场禁用"
            desc="关闭后，之前小局使用过的忍者仍可再次选出"
            checked={draft.usedNinjaLocked}
            onChange={(v) => setDraft({ ...draft, usedNinjaLocked: v })}
          />
          <div className="flex items-center justify-between gap-4 py-2">
            <span>
              <span className="block text-sm text-fog-100">每步倒计时</span>
              <span className="mt-0.5 block text-xs text-fog-600">同一序列步骤（如红方连续选 2 人）共用一份时间</span>
            </span>
            <div className="flex items-center gap-2">
              <select
                value={timerSelectValue}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'off') setDraft({ ...draft, timerEnabled: false })
                  else if (v === 'custom') setDraft({ ...draft, timerEnabled: true, timerSeconds: 45 })
                  else setDraft({ ...draft, timerEnabled: true, timerSeconds: Number(v) })
                }}
                className="rounded-lg border border-ink-500 bg-ink-900 px-2.5 py-1.5 text-xs text-fog-100 focus:outline-none"
              >
                {TIMER_PRESETS.map((s) => (
                  <option key={s} value={s}>{s} 秒</option>
                ))}
                <option value="custom">自定义</option>
                <option value="off">关闭</option>
              </select>
              {timerSelectValue === 'custom' && (
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={draft.timerSeconds}
                  onChange={(e) => setDraft({ ...draft, timerSeconds: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-ink-500 bg-ink-900 px-2.5 py-1.5 text-xs text-fog-100 focus:outline-none"
                />
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* 序列编辑器 */}
      <Section title="Ban / Pick 序列（高级）">
        <p className="mb-3 text-xs text-fog-600">
          当前预览：Ban（第 1 局）{preview.ban}；Pick（每局）{preview.pick}。JSON 格式：side（BLUE/RED）、action、count（1~6）。
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fog-300">banSequence</span>
            <textarea
              value={banText}
              onChange={(e) => setBanText(e.target.value)}
              rows={9}
              spellCheck={false}
              className="rounded-lg border border-ink-500 bg-ink-900 p-3 font-mono text-xs text-fog-100 focus:border-side-blue/60 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fog-300">pickSequence</span>
            <textarea
              value={pickText}
              onChange={(e) => setPickText(e.target.value)}
              rows={9}
              spellCheck={false}
              className="rounded-lg border border-ink-500 bg-ink-900 p-3 font-mono text-xs text-fog-100 focus:border-side-blue/60 focus:outline-none"
            />
          </label>
        </div>
        {errors.length > 0 && (
          <div className="mt-3 rounded-lg border border-side-red/40 bg-side-red/10 p-3 text-xs text-side-red-soft">
            <p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle size={12} /> 校验未通过</p>
            {errors.map((e) => (
              <p key={e}>· {e}</p>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveRule}
            className="flex items-center gap-1.5 rounded-lg bg-side-blue px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-side-blue/85"
          >
            <Save size={14} /> 保存规则
          </button>
          <button
            type="button"
            onClick={() => setResetRuleOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-4 py-2 text-xs text-fog-300 transition-colors hover:bg-ink-600"
          >
            <RotateCcw size={14} /> 恢复默认规则
          </button>
        </div>
      </Section>

      {/* 通用 */}
      <Section title="通用">
        <div className="divide-y divide-ink-700">
          <Toggle label="声音提示" desc="使用内置合成音（Ban / 选择 / 超时 / 胜利），默认关闭" checked={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
          <Toggle label="动画效果" desc="关闭后禁用过渡与动画，适合低性能设备" checked={settings.animationsEnabled} onChange={(v) => update({ animationsEnabled: v })} />
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm text-fog-100">忍者池排序</span>
            <select
              value={settings.ninjaSort}
              onChange={(e) => update({ ninjaSort: e.target.value as 'quality' | 'name' })}
              className="rounded-lg border border-ink-500 bg-ink-900 px-2.5 py-1.5 text-xs text-fog-100 focus:outline-none"
            >
              <option value="quality">品质优先（S→C）</option>
              <option value="name">按名称</option>
            </select>
          </div>
        </div>
      </Section>

      {/* 危险操作 */}
      <Section title="危险操作">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setResetPoolOpen(true)}
            className="rounded-lg border border-side-red/40 px-4 py-2 text-xs text-side-red-soft transition-colors hover:bg-side-red/10"
          >
            恢复示例忍者池
          </button>
        </div>
        <p className="mt-2 text-xs text-fog-600">恢复示例池会覆盖当前全部忍者数据，建议先在忍者池页面导出备份。</p>
      </Section>

      <ConfirmDialog
        open={resetRuleOpen}
        title="恢复默认规则模板？"
        message="当前自定义的 Ban/Pick 序列与规则开关将被重置为「武斗赛 BO3 默认模板」。"
        confirmText="恢复默认"
        danger
        onConfirm={handleRestoreDefault}
        onClose={() => setResetRuleOpen(false)}
      />
      <ConfirmDialog
        open={resetPoolOpen}
        title="恢复示例忍者池？"
        message="当前全部忍者数据将被覆盖为内置示例池。"
        confirmText="恢复"
        danger
        onConfirm={() => {
          resetNinjaPool()
          toast('已恢复内置示例忍者池', 'success')
        }}
        onClose={() => setResetPoolOpen(false)}
      />
    </div>
  )
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text // 非法 JSON 交给 parseSequenceSteps 报“必须是数组”
  }
}
