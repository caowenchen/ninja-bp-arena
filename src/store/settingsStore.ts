import { create } from 'zustand'
import type { BattleRule } from '@/types/bp'
import { DEFAULT_RULE, cloneRule } from '@/data/defaultRules'
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/utils/storage'

/** 应用设置（bp_settings）+ 自定义规则模板（battle_rules） */
export interface AppSettings {
  soundEnabled: boolean
  animationsEnabled: boolean
  /** 忍者池排序：品质优先 / 名称 */
  ninjaSort: 'quality' | 'name'
  /** 首次使用引导是否已看过 */
  firstUseTipSeen: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: false,
  animationsEnabled: true,
  ninjaSort: 'quality',
  firstUseTipSeen: false,
}

function isSettings(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'soundEnabled' in value && 'animationsEnabled' in value
}

interface SettingsStore {
  settings: AppSettings
  /** 自定义规则；为空表示使用默认模板 */
  customRule: BattleRule | null
  update: (patch: Partial<AppSettings>) => void
  saveCustomRule: (rule: BattleRule) => void
  resetCustomRule: () => void
  /** 当前生效规则（新比赛使用） */
  activeRule: () => BattleRule
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  settings: loadJSON<AppSettings>(STORAGE_KEYS.bpSettings, DEFAULT_SETTINGS, isSettings),
  customRule: loadJSON<BattleRule | null>(
    STORAGE_KEYS.battleRules,
    null,
    (v) => typeof v === 'object' && v !== null && 'banSequence' in v && 'pickSequence' in v,
  ),

  update: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    saveJSON(STORAGE_KEYS.bpSettings, settings)
  },

  saveCustomRule: (rule) => {
    set({ customRule: rule })
    saveJSON(STORAGE_KEYS.battleRules, rule)
  },

  resetCustomRule: () => {
    set({ customRule: null })
    saveJSON(STORAGE_KEYS.battleRules, null)
  },

  activeRule: () => {
    const custom = get().customRule
    return custom ? cloneRule(custom) : cloneRule(DEFAULT_RULE)
  },
}))
