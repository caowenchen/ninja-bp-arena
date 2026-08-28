import { clickButton, clickNinja, expect, phaseText, startMatch, test } from './helpers'

/**
 * 场景 1：完整 BO3
 * Game1 蓝胜 → Game2 红胜 → Game3 蓝胜，最终 2:1 MATCH FINISHED。
 * 途中确认 Ban 继承与 USED 锁定。
 */
test('完整 BO3：2:1 结束', async ({ page }) => {
  await startMatch(page)

  // ---- Game1 Ban：蓝1 → 红2 → 蓝1 ----
  await clickNinja(page, '漩涡鸣人')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方禁用阶段 · 还需选择 2 名忍者')
  await clickNinja(page, '宇智波佐助')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方禁用阶段 · 请选择 1 名忍者')
  await clickNinja(page, '旗木卡卡西')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方禁用阶段')
  await clickNinja(page, '宇智波鼬')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段')

  // ---- Game1 Pick：红1 → 蓝2 → 红2 → 蓝1 ----
  await clickNinja(page, '自来也')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方选择阶段 · 还需选择 2 名忍者')
  await clickNinja(page, '纲手')
  await clickNinja(page, '大蛇丸')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段 · 还需选择 2 名忍者')
  await clickNinja(page, '我爱罗')
  await clickNinja(page, '迪达拉')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('蓝方选择阶段')
  await clickNinja(page, '蝎')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('双方阵容已锁定')

  // Game1 蓝方获胜（二次确认）
  await clickButton(page, '进入比赛')
  await clickButton(page, '蓝方获胜')
  await clickButton(page, '确认获胜')
  await expect(page.locator('[role="dialog"]')).toContainText('GAME 1 RESULT')
  await clickButton(page, '进入 Game 2')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段')
  await expect(page.locator('header').first()).toContainText('1:0')

  // ---- Game2：Ban 仍禁用、Game1 出场忍者 USED ----
  await expect(page.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /自来也（已使用）/ })).toBeVisible()
  // 非法点击被拒绝且阶段不变
  await clickNinja(page, '漩涡鸣人')
  await expect(page.locator('body')).toContainText('该忍者已被禁用')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段')

  await clickNinja(page, '干柿鬼鲛')
  await clickNinja(page, '油女志乃')
  await clickNinja(page, '药师兜')
  await clickNinja(page, '静音')
  await clickNinja(page, '李洛克')
  await clickNinja(page, '天天')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('双方阵容已锁定')

  await clickButton(page, '进入比赛')
  await clickButton(page, '红方获胜')
  await clickButton(page, '确认获胜')
  await clickButton(page, '进入 Game 3')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('红方选择阶段')
  await expect(page.locator('header').first()).toContainText('1:1')

  // ---- Game3：Game1+Game2 全部 USED ----
  await expect(page.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /自来也（已使用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /干柿鬼鲛（已使用）/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /天天（已使用）/ })).toBeVisible()

  await clickNinja(page, '奈良鹿丸')
  await clickNinja(page, '秋道丁次')
  await clickNinja(page, '山中井野')
  await clickNinja(page, '犬冢牙')
  await clickNinja(page, '飞段')
  await clickNinja(page, '角都')
  await expect(page.locator('section[aria-live="polite"]')).toContainText('双方阵容已锁定')

  await clickButton(page, '进入比赛')
  await clickButton(page, '蓝方获胜')
  await clickButton(page, '确认获胜')

  // ---- 比赛结束：2:1 蓝方胜利 ----
  await expect(page.locator('body')).toContainText('蓝方胜利')
  await expect(page.locator('body')).toContainText('比赛结束')
  const score = await page.locator('header').first().innerText()
  expect(score).toContain('2:1')

  // 结束后不能再操作（重新开始按钮存在即可证明进入结束态）
  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible()
  // 阶段文本不再是进行中
  expect(await phaseText(page)).not.toContain('阶段')
})
