import { useMemo, useState } from 'react'

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
  avatar?: string
  alt?: string
  className?: string
  /** 头像文字大小 */
  textClassName?: string
}

/**
 * 忍者头像：avatar 为空或加载失败时显示「名字首字 + 渐变底」占位图。
 * 绝不出现破图 / 布局坍塌 / 无限重试。
 */
export function NinjaAvatar({ name, avatar, alt, className = '', textClassName = 'text-xl' }: NinjaAvatarProps) {
  const [failed, setFailed] = useState(false)
  const gradient = useMemo(() => {
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997
    return GRADIENTS[hash % GRADIENTS.length]
  }, [name])

  const placeholder = (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
      <span className={`font-semibold text-fog-300 ${textClassName}`}>{name.charAt(0) || '忍'}</span>
    </div>
  )

  if (!avatar || failed) {
    return <div className={`overflow-hidden ${className}`}>{placeholder}</div>
  }

  return (
    <div className={`overflow-hidden bg-ink-700 ${className}`}>
      <img
        src={avatar}
        alt={alt ?? name}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
