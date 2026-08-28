import { expect, test } from './helpers'

/** 场景 5：损坏的 localStorage —— 不白屏，回到安全状态 */
test('损坏的 current_match 不导致白屏', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '忍界 BP' })).toBeVisible()

  // 写入非法 current_match 后刷新
  await page.evaluate(() => {
    localStorage.setItem('ninja-bp.current_match', JSON.stringify({ games: [], rule: {} }))
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '忍界 BP' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('页面出现异常')
  // 首页正常渲染（坏比赛被丢弃），可以重新开始比赛
  await expect(page.getByRole('button', { name: '开始 BP' }).first()).toBeVisible()
})

test('完全非法的 JSON 与 recent_matches 混入坏数据', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('ninja-bp.current_match', 'abc')
    localStorage.setItem('ninja-bp.recent_matches', JSON.stringify([{ nonsense: 1 }, 42, 'x']))
    localStorage.setItem('ninja-bp.ninja_pool', JSON.stringify([{ name: '没有ID和品质' }, { bad: true }]))
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '忍界 BP' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('页面出现异常')

  // 忍者池全部损坏时回退内置示例池
  await page.goto('/ninjas')
  await expect(page.getByText(/共 \d+ 名忍者/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('页面出现异常')
})
