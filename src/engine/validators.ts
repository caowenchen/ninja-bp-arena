import type { Ninja } from '@/types/ninja'
import { canSelectNinja, getNinjaCardStatus, type NinjaCardStatus } from './bpEngine'

/**
 * 面向 UI 的校验门面。
 * 注意：真正的判定都在 bpEngine.canSelectNinja，这里只做转发与补充，
 * 避免“同一套可用性逻辑在多个组件各写一遍”。
 */

export { canSelectNinja, getNinjaCardStatus }
export type { NinjaCardStatus }

export function isNinjaEnabled(ninja: Ninja | undefined): boolean {
  return !!ninja && ninja.enabled
}

/** 忍者池管理页：名称/品质表单校验 */
export function validateNinjaForm(input: { name: string; quality: string; avatar: string; tags: string[] }): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('忍者名称不能为空')
  if (input.name.trim().length > 30) errors.push('忍者名称过长（最多 30 字）')
  if (!['S', 'A', 'B', 'C'].includes(input.quality)) errors.push('品质必须是 S / A / B / C')
  // 头像支持远程 URL 与 /assets/ninjas/ 本地资源路径
  if (input.avatar.trim() && !/^(https?:\/\/|data:image\/|\/)/i.test(input.avatar.trim())) {
    errors.push('头像需以 http(s)://、data:image/ 或 / 开头（本地资源放 public/assets/ninjas/）')
  }
  if (input.tags.length > 8) errors.push('标签最多 8 个')
  return errors
}
