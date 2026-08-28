import { Outlet, useLocation } from 'react-router-dom'
import { NavBar } from '@/components/common/NavBar'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ToastHost } from '@/components/common/Toast'
import { useSettingsStore } from '@/store/settingsStore'

/** 应用外壳：导航 + 路由出口 + 全局 Toast + 免责声明 */
export default function App() {
  const location = useLocation()
  const animationsEnabled = useSettingsStore((s) => s.settings.animationsEnabled)
  const isBPPage = location.pathname === '/bp'

  return (
    <div className={`flex min-h-screen flex-col ${animationsEnabled ? '' : 'fx-off'}`}>
      <ErrorBoundary>
        {!isBPPage && <NavBar />}
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="border-t border-ink-700 px-4 py-4 text-center text-[11px] leading-relaxed text-fog-600">
          忍界 BP · Ninja BP Arena —— 本工具为玩家制作的非官方赛事 BP 辅助工具，与游戏官方无隶属或合作关系。
          <br className="hidden sm:block" />
          内置忍者与规则均为示例，可自行导入与配置。
        </footer>
      </ErrorBoundary>
      <ToastHost />
    </div>
  )
}
