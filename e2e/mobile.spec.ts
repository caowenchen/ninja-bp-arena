import { clickButton, clickNinja, expect, startMatch, test } from './helpers'

/** 场景 4：移动端 375×812 —— 无横向滚动，可搜索 / 点击 / 历史 / 撤销 */
test.use({ viewport: { width: 375, height: 812 } })

test('移动端可完成 BP 操作', async ({ page }) => {
  await startMatch(page)

  // 无明显横向滚动
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  // 移动端阵容条存在（BLUE/RED 简版 + 展开按钮）
  await expect(page.getByRole('button', { name: /BLUE/ }).first()).toBeVisible()

  // 搜索忍者并点击
  await page.getByLabel('搜索忍者').fill('鸣人')
  await expect(page.getByRole('button', { name: /漩涡鸣人（可选）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /宇智波佐助（可选）/ })).toHaveCount(0)
  await page.getByLabel('搜索忍者').fill('')
  await clickNinja(page, '漩涡鸣人')

  // Ban 成功：阶段切到红方
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方禁用阶段')

  // 打开历史抽屉并关闭
  await page.getByRole('button', { name: '历史', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '历史记录' })
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('01')
  await expect(drawer).toContainText('漩涡鸣人')
  await page.getByLabel('关闭历史记录').click()

  // 撤销后重做一次 Ban
  await clickButton(page, '撤销')
  await expect(page.getByRole('button', { name: /漩涡鸣人（可选）/ })).toBeVisible()
  await clickNinja(page, '漩涡鸣人')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方禁用阶段')

  // 仍然没有横向滚动
  const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth2).toBeLessThanOrEqual(clientWidth + 1)
})
