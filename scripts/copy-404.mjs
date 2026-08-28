import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * GitHub Pages SPA 方案：把 index.html 复制为 404.html。
 * 用户直接访问 /bp 等子路径时，Pages 会以 404.html 兜底渲染 SPA，
 * React Router 随后接管真实路径，刷新不再 404。
 */
const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, '..', 'dist')
const indexHtml = join(dist, 'index.html')

if (!existsSync(indexHtml)) {
  console.error('[copy-404] dist/index.html 不存在，请先执行 vite build')
  process.exit(1)
}
mkdirSync(dist, { recursive: true })
copyFileSync(indexHtml, join(dist, '404.html'))
console.log('[copy-404] dist/404.html 已生成')
