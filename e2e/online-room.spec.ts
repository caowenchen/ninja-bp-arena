import { expect, test } from '@playwright/test'

/**
 * 在线房间 E2E（双 BrowserContext 模拟两名玩家 + 观战者）。
 *
 * ⚠ 需要真实 Supabase 环境：SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 通过
 * 环境变量注入（Playwright 读取 .env 或 CI Variables）。未配置时整体跳过，
 * 绝不伪造“在线测试通过”。
 */

const SUPABASE_READY = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY)

test.skip(!SUPABASE_READY, '需要 Supabase 环境变量（VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY）才能运行在线 E2E')

const NAMES = ['蓝方E2E', '红方E2E']

test.describe.serial('在线 BP 房间', () => {
  let roomCode = ''

  test('创建房间并显示房间号', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await a.goto('/online')
    await a.getByText('比赛规则（当前模板）').waitFor()
    await a.getByPlaceholder('蓝方玩家').fill(NAMES[0])
    await a.getByRole('button', { name: /创建房间/ }).click()
    await a.waitForURL(/\/room\/[A-Z2-9]{6}/, { timeout: 15000 })
    roomCode = a.url().match(/[A-Z2-9]{6}$/)![0]
    await expect(a.getByText('WAITING ROOM')).toBeVisible()
    await expect(a.getByText(roomCode).first()).toBeVisible()
    await ctxA.close()
  })

  test('第二玩家加入，双方实时可见；观战者只读', async ({ browser }) => {
    test.skip(!roomCode, '依赖前一用例的房间号')
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const ctxO = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()
    const o = await ctxO.newPage()

    // A 重新打开自己的房间链接（幂等回到同一席位）
    await a.goto(`/room/${roomCode}`)
    await expect(a.getByText('等待加入……')).toBeVisible()

    // B 通过房间码加入
    await b.goto('/online')
    await b.getByLabel('房间号').fill(roomCode)
    await b.getByPlaceholder('你的名称（可选）').fill(NAMES[1])
    await b.getByRole('button', { name: /加入房间/ }).click()
    await b.waitForURL(/\/room\/[A-Z2-9]{6}/)
    await expect(b.getByText('RED 红方').locator('..')).toContainText(NAMES[1])

    // A 侧实时出现红方（无需刷新）
    await expect(a.getByText(NAMES[1])).toBeVisible({ timeout: 10000 })

    // 观战者通过 ?watch=1 加入
    await o.goto(`/room/${roomCode}?watch=1`)
    await o.getByRole('button', { name: /加入房间/ }).click()
    await expect(o.getByText(/观战：1 人/)).toBeVisible({ timeout: 10000 })

    // Host（A，蓝方）开始比赛
    await a.getByRole('button', { name: /开始比赛/ }).click()
    await expect(a.getByText('蓝方禁用阶段')).toBeVisible({ timeout: 15000 })
    // B / 观战者实时进入 BP
    await expect(b.getByText('蓝方禁用阶段')).toBeVisible({ timeout: 15000 })
    await expect(o.getByText('蓝方禁用阶段')).toBeVisible({ timeout: 15000 })

    // 回合权限：红方在蓝方回合点击 → 客户端提示等待
    await b.getByRole('button', { name: /漩涡鸣人/ }).click()
    await expect(b.locator('body')).toContainText('等待对方选择')

    // 蓝方正常 Ban
    await a.getByRole('button', { name: /漩涡鸣人/ }).click()
    // 双方 + 观战实时同步
    await expect(a.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible({ timeout: 10000 })
    await expect(b.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible({ timeout: 10000 })
    await expect(o.getByRole('button', { name: /漩涡鸣人（已禁用）/ })).toBeVisible({ timeout: 10000 })

    // 观战者界面没有操作入口（底栏申请撤销被禁用）
    await expect(o.getByRole('button', { name: '申请撤销' })).toBeDisabled()

    await ctxA.close()
    await ctxB.close()
    await ctxO.close()
  })

  test('断线重连：红方刷新后恢复席位与状态', async ({ browser }) => {
    test.skip(!roomCode, '依赖前一用例的房间号')
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`/room/${roomCode}`)
    await page.getByPlaceholder('玩家').fill(NAMES[1])
    await page.getByRole('button', { name: /加入房间/ }).click()
    await page.waitForURL(/\/room\/[A-Z2-9]{6}/)
    // 刷新 → 匿名会话保持 → 自动恢复席位
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.locator('body')).toContainText(roomCode)
    await ctx.close()
  })
})
