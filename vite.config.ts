import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

export default defineConfig(({ mode }) => ({
  // GitHub Pages 项目页构建（npm run build:pages）使用子路径 base；本地开发保持 /
  base: mode === 'pages' ? '/ninja-bp-arena/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared BP Core 单一来源（Deno Edge Functions 与前端共用）
      '@bp-core': fileURLToPath(new URL('./supabase/functions/_shared/bp-core', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}))
