import { defineConfig } from '@playwright/test'

/**
 * E2E 测试：只测真实用户流程（BO3 全流程 / 撤销 / 刷新恢复 / 移动端 / 坏数据）。
 * 本机复用已在运行的 dev server；CI 中自行启动。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.CI
    ? {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
