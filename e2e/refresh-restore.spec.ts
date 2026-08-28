import { clickNinja, expect, startMatch, test } from './helpers'

/** 场景 3：BP 中刷新恢复 —— Game / 比分 / Ban / Pick / 阶段 / 行动方 / 倒计时 */
test('刷新后恢复比赛状态与倒计时', async ({ page }) => {
  await startMatch(page)

  // Game1：4 Ban + 红方 Pick 1
  await clickNinja(page, '漩涡鸣人')
  await clickNinja(page, '宇智波佐助')
  await clickNinja(page, '旗木卡卡西')
  await clickNinja(page, '宇智波鼬')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段')
  await clickNinja(page, '自来也')

  // 记录刷新前的倒计时（等待几秒确保不是满额 60）
  await page.waitForTimeout(3200)
  const timerText = await page.locator('section[aria-live="polite"] .tabular-nums').first().innerText()
  const beforeSeconds = Number(timerText.trim())
  expect(beforeSeconds).toBeGreaterThan(0)
  expect(beforeSeconds).toBeLessThan(60)

  // 刷新
  await page.reload()
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方选择阶段 · 还需选择 2 名忍者')

  // 比分 / Game / 阶段 / 状态全部恢复
  await expect(page.locator('header').first()).toContainText('0:0')
  await expect(page.locator('header').first()).toContainText('GAME 1')
  await expect(page.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /宇智波佐助（已禁用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /自来也（红方已选）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /纲手（可选）/ })).toBeVisible()

  // 倒计时：不重新给满 60 秒（deadline 持久化）
  await page.waitForTimeout(1200)
  const timerText2 = await page.locator('section[aria-live="polite"] .tabular-nums').first().innerText()
  const afterSeconds = Number(timerText2.trim())
  expect(afterSeconds).toBeGreaterThan(0)
  expect(afterSeconds).toBeLessThanOrEqual(beforeSeconds)
})
