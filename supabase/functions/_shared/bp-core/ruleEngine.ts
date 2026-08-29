import type { BPActionType, BPSequenceStep, BattleRule, Side } from './types.ts'

/**
 * 规则引擎：负责 BP 序列的展开与校验。
 * 比赛流程完全由 BattleRule 配置驱动，禁止在 UI 里硬编码顺序。
 */

/** 展开后的单步动作：一个 step(count=N) 会展开成 N 个 ExpandedAction */
export interface ExpandedAction {
  side: Side
  action: BPActionType
  /** 属于第几个序列步骤 */
  stepIndex: number
  /** 该步骤内的第几个（0 起） */
  indexInStep: number
}

export function expandSequence(steps: BPSequenceStep[]): ExpandedAction[] {
  const out: ExpandedAction[] = []
  steps.forEach((step, stepIndex) => {
    for (let i = 0; i < step.count; i += 1) {
      out.push({ side: step.side, action: step.action, stepIndex, indexInStep: i })
    }
  })
  return out
}

const SIDE_TEXT: Record<Side, string> = { BLUE: '蓝方', RED: '红方' }
const ACTION_TEXT: Record<BPActionType, string> = { BAN: '禁用', PICK: '选择' }

/** 人类可读的序列描述，如 “蓝方 禁用×1 → 红方 禁用×2” */
export function describeSequence(steps: BPSequenceStep[]): string {
  if (!steps.length) return '（无）'
  return steps.map((s) => `${SIDE_TEXT[s.side]} ${ACTION_TEXT[s.action]}×${s.count}`).join(' → ')
}

export interface SequenceParseResult {
  steps?: BPSequenceStep[]
  errors: string[]
}

/**
 * 校验一段序列 JSON（来自规则编辑器）。
 * banSequence 内只允许 BAN 步骤，pickSequence 内只允许 PICK 步骤，
 * 且引擎约定 Ban 全部完成后才进入 Pick。
 */
export function parseSequenceSteps(input: unknown, label: string, expectedAction: BPActionType): SequenceParseResult {
  const errors: string[] = []
  if (!Array.isArray(input)) {
    return { errors: [`${label} 必须是数组`] }
  }
  if (input.length === 0) {
    errors.push(`${label} 不能为空`)
  }
  const steps: BPSequenceStep[] = []
  input.forEach((item, i) => {
    const no = i + 1
    if (typeof item !== 'object' || item === null) {
      errors.push(`${label} 第 ${no} 项格式错误`)
      return
    }
    const rec = item as Record<string, unknown>
    const side = rec.side
    const action = rec.action
    if (side !== 'BLUE' && side !== 'RED') {
      errors.push(`${label} 第 ${no} 项：side 必须是 "BLUE" 或 "RED"`)
      return
    }
    // 先校验字面量让 TS 收窄类型，再校验是否与期望动作一致
    if (action !== 'BAN' && action !== 'PICK') {
      errors.push(`${label} 第 ${no} 项：action 必须是 "${expectedAction}"`)
      return
    }
    if (action !== expectedAction) {
      errors.push(`${label} 第 ${no} 项：action 必须是 "${expectedAction}"`)
      return
    }
    const count = rec.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 6) {
      errors.push(`${label} 第 ${no} 项：count 必须是 1~6 的整数`)
      return
    }
    steps.push({ side, action, count })
  })
  if (errors.length) return { errors }
  return { steps, errors }
}

/** 校验整份规则（设置页保存 / 在线房间创建时使用） */
export function validateBattleRule(rule: BattleRule): string[] {
  const errors: string[] = []
  if (![1, 3, 5, 7].includes(rule.bestOf)) errors.push('赛制 bestOf 只支持 1 / 3 / 5 / 7')
  if (!Number.isInteger(rule.winsRequired) || rule.winsRequired < 1 || rule.winsRequired > rule.bestOf) {
    errors.push('winsRequired 必须是 1 ~ bestOf 的整数')
  }
  if (!Number.isInteger(rule.timerSeconds) || rule.timerSeconds < 5 || rule.timerSeconds > 600) {
    errors.push('倒计时秒数必须在 5 ~ 600 之间')
  }
  const ban = parseSequenceSteps(rule.banSequence, 'banSequence', 'BAN')
  const pick = parseSequenceSteps(rule.pickSequence, 'pickSequence', 'PICK')
  errors.push(...ban.errors, ...pick.errors)
  if (ban.steps && pick.steps) {
    const totalPicks = pick.steps.reduce((sum, s) => sum + s.count, 0)
    const bluePicks = pick.steps.filter((s) => s.side === 'BLUE').reduce((sum, s) => sum + s.count, 0)
    if (totalPicks <= 0) errors.push('pickSequence 至少要有一次选择')
    if (bluePicks * 2 !== totalPicks) errors.push('当前引擎要求双方 Pick 总数相等（双方上场人数一致）')
  }
  return errors
}
