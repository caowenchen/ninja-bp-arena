import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Play, ScrollText, Settings, X } from 'lucide-react'
import { MatchSetupDialog } from '@/components/match/MatchSetupDialog'
import { useBPStore } from '@/store/bpStore'

const NAV_ITEMS = [
  { to: '/', label: '首页' },
  { to: '/ninjas', label: '忍者池', icon: ScrollText },
  { to: '/settings', label: '规则设置', icon: Settings },
  { to: '/about', label: '关于' },
] as const

/** 顶部导航：BP 进行页面隐藏，移动端折叠为汉堡菜单 */
export function NavBar() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const unfinished = useBPStore((s) => (s.match && s.match.status !== 'MATCH_FINISHED' ? s.match : null))
  const menuRef = useRef<HTMLDivElement>(null)

  // 路由变化时收起移动端菜单
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-border-muted bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-13 w-full max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-blue-team/30 to-surface-1 text-sm font-bold text-blue-team-soft ring-1 ring-blue-team/40">
            忍
          </span>
          <span className="text-sm font-bold tracking-wide text-fog-100">忍界 BP</span>
        </Link>

        {/* 桌面导航 */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-surface-2 text-fog-100' : 'text-fog-400 hover:bg-surface-2 hover:text-fog-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="ml-1 flex items-center gap-1.5 rounded bg-blue-team px-3.5 py-1.5 text-sm font-bold text-white transition-colors hover:brightness-110"
          >
            <Play size={13} /> 开始 BP
          </button>
        </nav>

        {/* 移动端汉堡 */}
        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="菜单"
            aria-expanded={menuOpen}
            className="rounded p-2 text-fog-300 transition-colors hover:bg-surface-2"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-44 rounded-lg border border-border-strong bg-surface-1 p-1.5 shadow-xl shadow-black/50">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `block rounded px-3 py-2 text-sm ${isActive ? 'bg-surface-2 text-fog-100' : 'text-fog-300'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setSetupOpen(true)
                }}
                className="block w-full rounded px-3 py-2 text-left text-sm font-bold text-blue-team-soft"
              >
                开始 BP
              </button>
            </div>
          )}
        </div>
      </div>

      <MatchSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} unfinished={unfinished} />
    </header>
  )
}
