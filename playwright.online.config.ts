import { defineConfig } from '@playwright/test'

/**
 * 在线集成测试（针对 Supabase Local 或测试项目）。
 *
 * 与本地 E2E 分离：
 * - `npm run test:online` 必须在 Supabase 环境可用时运行；
 *   环境变量缺失时在配置加载阶段直接抛错（进程非零退出），
 *   绝不进入测试后全部 skip 然后显示成功。
 * - 环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
 *   （Supabase Local 默认 http://127.0.0.1:54321 + 本地 anon key）
 */
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Online integration requires a running Supabase environment.\n' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before running `npm run test:online`.\n' +
      'Local stack: supabase start, then VITE_SUPABASE_URL=http://127.0.0.1:54321 and the local anon key.',
  )
}

export default defineConfig({
  testDir: './e2e/online',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
