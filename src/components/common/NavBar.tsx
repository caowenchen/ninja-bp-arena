import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Info, Menu, Play, ScrollText, Settings, X } from 'lucide-react'
import { MatchSetupDialog } from '@/components/match/MatchSetupDialog'
import { Dialog } from '@/components/common/Dialog'
import { useBPStore } from '@/store/bpStore'

const NAV_ITEMS = [
  { to: '/', label: '首页' },
  { to: '/ninjas', label: '忍者池', icon: ScrollText },
  { to: '/settings', label: '规则设置', icon: Settings },
] as const

/** 顶部导航：BP 进行页面隐藏，移动端折叠为汉堡菜单 */
export function NavBar() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const unfinished = useBPStore((s) => (s.match && s.match.status !== 'MATCH_FINISHED' ? s.match : null))
  const menuRef = useRef<HTMLDivElement>(null)

  // 路由变化时收起移动端菜单
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-ink-600 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex h-13 w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-side-blue/30 to-ink-800 text-sm font-bold text-side-blue-soft ring-1 ring-side-blue/40">
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
                `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  isActive ? 'bg-ink-600 text-fog-100' : 'text-fog-400 hover:bg-ink-700 hover:text-fog-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="ml-1 flex items-center gap-1.5 rounded-lg bg-side-blue px-3.5 py-1.5 text-sm font-bold text-white transition-colors hover:bg-side-blue/85"
          >
            <Play size={13} /> 开始 BP
          </button>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="rounded-lg p-2 text-fog-400 transition-colors hover:bg-ink-700 hover:text-fog-100"
            aria-label="关于"
          >
            <Info size={15} />
          </button>
        </nav>

        {/* 移动端汉堡 */}
        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="菜单"
            aria-expanded={menuOpen}
            className="rounded-lg p-2 text-fog-300 transition-colors hover:bg-ink-600"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-44 rounded-xl border border-ink-500 bg-ink-800 p-1.5 shadow-xl shadow-black/50">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-ink-600 text-fog-100' : 'text-fog-300'}`
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
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-side-blue-soft"
              >
                开始 BP
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setAboutOpen(true)
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-fog-300"
              >
                关于
              </button>
            </div>
          )}
        </div>
      </div>

      <MatchSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} unfinished={unfinished} />
      <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} title="关于 忍界 BP">
        <div className="space-y-2 text-sm leading-relaxed text-fog-300">
          <p>忍界 BP · 火影忍者手游武斗赛 BP 模拟器（Ninja BP Arena）</p>
          <p className="text-xs text-fog-500">v0.1.0 · 纯前端本地工具，数据保存在浏览器 localStorage 中</p>
          <p className="rounded-lg border border-gold/30 bg-gold/10 p-2.5 text-xs text-gold">
            本工具为玩家制作的非官方赛事 BP 辅助工具，与游戏官方无隶属或合作关系。
          </p>
          <p className="text-xs text-fog-600">
            内置忍者数据为示例数据，不代表官方名单；Ban/Pick 规则模板可自行修改，默认模板仅供参考。
          </p>
        </div>
      </Dialog>
    </header>
  )
}
