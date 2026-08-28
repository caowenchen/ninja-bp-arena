import { describe, expect, it } from 'vitest'
import type { Ninja } from '../src/types/ninja'
import { mergeNinjas, parseNinjaImport } from '../src/utils/importExport'

/** 忍者 JSON 导入：校验失败绝不能让应用崩溃（需求 四十三 / 三十九） */
describe('忍者 JSON 导入', () => {
  it('非法 JSON 文本被拒绝并给出错误', () => {
    const r = parseNinjaImport('这不是JSON{{{')
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('JSON 解析失败')
    expect(r.ninjas).toHaveLength(0)
  })

  it('顶层数组 / { ninjas: [] } 包装均支持，其他结构被拒绝', () => {
    expect(parseNinjaImport('{"a":1}').ok).toBe(false)
    const wrapped = parseNinjaImport(JSON.stringify({ ninjas: [{ name: 'X', quality: 'B' }] }))
    expect(wrapped.ok).toBe(true)
    expect(wrapped.ninjas[0].name).toBe('X')
  })

  it('缺少 name / 非法 quality 的条目被逐条报告', () => {
    const r = parseNinjaImport(
      JSON.stringify([
        { quality: 'S' },
        { name: '缺品质' },
        { name: '坏品质', quality: 'SSS' },
        { name: '合法忍者', quality: 'A', tags: ['近战', 123] },
      ]),
    )
    expect(r.ok).toBe(false)
    expect(r.ninjas).toHaveLength(1)
    expect(r.ninjas[0].name).toBe('合法忍者')
    expect(r.ninjas[0].tags).toEqual(['近战'])
    expect(r.errors).toHaveLength(3)
    expect(r.errors.some((e) => e.includes('name'))).toBe(true)
    expect(r.errors.some((e) => e.includes('quality'))).toBe(true)
  })

  it('文件内重复 ID 被拒绝，缺失 ID 自动生成', () => {
    const dup = parseNinjaImport(
      JSON.stringify([
        { id: 'dup-1', name: 'A', quality: 'B' },
        { id: 'dup-1', name: 'B', quality: 'B' },
      ]),
    )
    expect(dup.ok).toBe(false)
    expect(dup.errors[0]).toContain('重复')

    const auto = parseNinjaImport(JSON.stringify([{ name: '无ID忍者', quality: 'C' }]))
    expect(auto.ok).toBe(true)
    expect(auto.ninjas[0].id).toBeTruthy()
  })

  it('合并按 id 去重：已有更新、未有新增', () => {
    const existing: Ninja[] = [{ id: 'x1', name: '旧名', quality: 'C', tags: [], enabled: true }]
    const incoming: Ninja[] = [
      { id: 'x1', name: '新名', quality: 'S', tags: [], enabled: true },
      { id: 'x2', name: '新忍者', quality: 'A', tags: [], enabled: true },
    ]
    const { pool, added, updated } = mergeNinjas(existing, incoming)
    expect(added).toBe(1)
    expect(updated).toBe(1)
    expect(pool).toHaveLength(2)
    expect(pool.find((n) => n.id === 'x1')?.name).toBe('新名')
  })
})
