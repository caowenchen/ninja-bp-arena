import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from './App'
import HomePage from '@/pages/HomePage'
import BPPage from '@/pages/BPPage'
import NinjaPoolPage from '@/pages/NinjaPoolPage'
import SettingsPage from '@/pages/SettingsPage'
import ResultPage from '@/pages/ResultPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'bp', element: <BPPage /> },
      { path: 'ninjas', element: <NinjaPoolPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'result/:id', element: <ResultPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
