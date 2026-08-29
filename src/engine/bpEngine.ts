/**
 * Shared BP Core 的客户端转发层。
 * 真正的实现位于 ../../shared/bp-core（浏览器与 Edge Function 共用），
 * 这里只保持既有 import 路径（@/engine/...）不变。
 */
export * from '../../shared/bp-core/bpEngine'
