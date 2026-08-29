import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from './App'
import HomePage from '@/pages/HomePage'
import BPPage from '@/pages/BPPage'
import NinjaPoolPage from '@/pages/NinjaPoolPage'
import SettingsPage from '@/pages/SettingsPage'
import ResultPage from '@/pages/ResultPage'
import AboutPage from '@/pages/AboutPage'
import OnlineHubPage from '@/pages/OnlineHubPage'
import RoomPage from '@/pages/RoomPage'

/**
 * GitHub Pages 项目页部署时 Vite base 为 /ninja-bp-arena/，
 * BrowserRouter 需要一致的 basename，否则子路由匹配不到。
 * 本地开发 base = '/'，basename 同步为 '/'。
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'bp', element: <BPPage /> },
        { path: 'online', element: <OnlineHubPage /> },
        { path: 'room/:code', element: <RoomPage /> },
        { path: 'ninjas', element: <NinjaPoolPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'result/:id', element: <ResultPage /> },
        { path: 'about', element: <AboutPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  basename ? { basename } : undefined,
)
