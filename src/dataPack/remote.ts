import type { NinjaDataPackManifest } from '@bp-core'
import { validateDataPackManifest } from '@bp-core'

/**
 * 远程数据包获取（纯 JSON，绝不执行任何远端代码）。
 *
 * 安全约束：
 * - 仅接受 https://（localhost / 127.0.0.1 的 http 仅在开发模式放行）
 * - manifest ≤ 100KB，ninjas.json ≤ 5MB（防止超大响应拖垮页面）
 * - 12 秒超时（AbortController），失败保留旧数据
 * - manifest 结构必须先通过校验才能进入后续流程
 */

export const REMOTE_MANIFEST_MAX_BYTES = 100 * 1024
export const REMOTE_NINJAS_MAX_BYTES = 5 * 1024 * 1024
export const REMOTE_TIMEOUT_MS = 12_000

export type RemoteFetchErrorCode =
  | 'INVALID_URL'
  | 'INSECURE_URL'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_SCHEMA'

export class RemoteFetchError extends Error {
  code: RemoteFetchErrorCode
  status?: number

  constructor(code: RemoteFetchErrorCode, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** 校验远程 URL：生产仅 https；localhost 的 http 仅开发模式放行 */
export function assertRemoteUrl(rawUrl: string, devMode = import.meta.env.DEV): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new RemoteFetchError('INVALID_URL', '远程地址格式不正确')
  }
  if (parsed.protocol === 'https:') return
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
  if (parsed.protocol === 'http:' && isLocal && devMode) return
  throw new RemoteFetchError('INSECURE_URL', '远程数据包地址必须使用 https://')
}

interface FetchOptions {
  maxBytes: number
  /** 校验响应文本（如 manifest schema）；抛 RemoteFetchError 表示拒绝 */
  validate?: (text: string) => void
}

async function fetchText(url: string, options: FetchOptions): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    })
    if (res.url) assertRemoteUrl(res.url)
    if (!res.ok) {
      throw new RemoteFetchError('HTTP_ERROR', `远程服务器返回 ${res.status}`, res.status)
    }
    const length = Number(res.headers.get('content-length') ?? '0')
    if (length > options.maxBytes) {
      throw new RemoteFetchError('TOO_LARGE', `响应体积超出限制（>${Math.round(options.maxBytes / 1024)}KB）`)
    }
    // 定时器覆盖响应体读取，而不只是等待响应头；慢速流同样会被中止。
    const body = await res.text()
    if (new TextEncoder().encode(body).byteLength > options.maxBytes) {
      throw new RemoteFetchError('TOO_LARGE', '响应体积超出限制')
    }
    options.validate?.(body)
    return body
  } catch (err) {
    if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new RemoteFetchError('TIMEOUT', '下载超时，请稍后重试')
    }
    if (err instanceof RemoteFetchError) throw err
    throw new RemoteFetchError('HTTP_ERROR', `网络请求失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
}

/** 获取并校验远程 manifest（只下载清单，不下载忍者数据） */
export async function fetchRemoteManifest(url: string): Promise<NinjaDataPackManifest> {
  assertRemoteUrl(url)
  const text = await fetchText(url, {
    maxBytes: REMOTE_MANIFEST_MAX_BYTES,
    validate: (t) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(t)
      } catch {
        throw new RemoteFetchError('INVALID_JSON', 'manifest 不是合法 JSON')
      }
      const errors = validateDataPackManifest(parsed)
      if (errors.length > 0) {
        throw new RemoteFetchError('INVALID_SCHEMA', `manifest 校验失败：${errors[0]}`)
      }
    },
  })
  return JSON.parse(text) as NinjaDataPackManifest
}

/** 获取远程 ninjas.json 文本（caller 负责校验 checksum 与内容） */
export async function fetchRemoteNinjas(baseUrl: string, ninjasPath: string): Promise<string> {
  assertRemoteUrl(ninjasPath.startsWith('http') ? ninjasPath : new URL(ninjasPath, baseUrl).toString())
  const url = ninjasPath.startsWith('http') ? ninjasPath : new URL(ninjasPath, baseUrl).toString()
  return fetchText(url, { maxBytes: REMOTE_NINJAS_MAX_BYTES })
}
