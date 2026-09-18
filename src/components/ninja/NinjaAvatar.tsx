import { useMemo, useState } from 'react'
import { resolveNinjaAsset, markAssetFailed, isAssetKnownFailed } from '@/dataPack/assetResolver'
import { useDataPackStore } from '@/dataPack/store'

const GRADIENTS = [
  'from-sky-800/70 to-slate-900',
  'from-indigo-800/70 to-slate-900',
  'from-slate-700/70 to-slate-900',
  'from-emerald-800/60 to-slate-900',
  'from-rose-900/60 to-slate-900',
  'from-amber-800/60 to-slate-900',
]

interface NinjaAvatarProps {
  name: string
  /** 显式头像地址（用户编辑 / 数据包自带 URL；经 Asset Resolver 优先级解析） */
  avatar?: string
  /** 素材键：与当前数据包 manifest.assetBaseUrl 拼接（数据 JSON 不写长 URL） */
  assetKey?: string
  alt?: string
  className?: string
  /** 头像文字大小 */
  textClassName?: string
}

/**
 * 忍者头像：解析失败或无素材时显示「名字首字 + 渐变底」占位图。
 * - URL 解析统一走 Asset Resolver（avatar → assetBaseUrl + assetKey → 占位）
 * - 加载失败的地址记入会话级缓存，同一 session 不再重复请求（防无限重试）
 * - 懒加载（loading="lazy"）：300+ 忍者首屏不请求全部图片
 * 绝不出现破图 / 布局坍塌。
 */
export function NinjaAvatar({ name, avatar, assetKey, alt, className = '', textClassName = 'text-xl' }: NinjaAvatarProps) {
  const [failed, setFailed] = useState(false)
  const assetBaseUrl = useDataPackStore((s) => s.activePack()?.manifest.assetBaseUrl ?? null)
  const gradient = useMemo(() => {
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997
    return GRADIENTS[hash % GRADIENTS.length]
  }, [name])

  const resolved = useMemo(
    () => resolveNinjaAsset({ avatar, assetKey }, assetBaseUrl ? { assetBaseUrl } : null),
    [avatar, assetKey, assetBaseUrl],
  )
  const knownFailed = resolved ? isAssetKnownFailed(resolved) : false

  const placeholder = (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
      <span className={`font-semibold text-fog-300 ${textClassName}`}>{name.charAt(0) || '忍'}</span>
    </div>
  )

  if (!resolved || failed || knownFailed) {
    return <div className={`overflow-hidden ${className}`}>{placeholder}</div>
  }

  return (
    <div className={`overflow-hidden bg-ink-700 ${className}`}>
      <img
        src={resolved}
        alt={alt ?? name}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => {
          markAssetFailed(resolved)
          setFailed(true)
        }}
      />
    </div>
  )
}
