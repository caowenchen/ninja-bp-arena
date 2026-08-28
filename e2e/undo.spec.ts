import { clickNinja, expect, phaseText, startMatch, test } from './helpers'

/** 场景 2：撤销 —— BLUE BAN A → Undo → A 重新可选 → 改 Ban B */
test('撤销 Ban 后忍者重新可选', async ({ page }) => {
  await startMatch(page)
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方禁用阶段')

  await clickNinja(page, '漩涡鸣人')
  await expect(page.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible()
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方禁用阶段')

  // 撤销（底栏按钮）
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByRole('button', { name: /漩涡鸣人（可选）/ })).toBeVisible()
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方禁用阶段')

  // 改 Ban 宇智波佐助
  await clickNinja(page, '宇智波佐助')
  await expect(page.getByRole('button', { name: /宇智波佐助（已禁用）/ })).toBeVisible()
  expect(await phaseText(page)).toContain('红方禁用阶段')
})
