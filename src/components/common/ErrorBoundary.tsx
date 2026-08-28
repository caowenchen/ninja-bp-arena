import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** 错误边界：单个组件异常不致整站白屏 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-semibold text-fog-100">页面出现异常</h1>
          <p className="max-w-md text-sm text-fog-500">{this.state.error.message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-side-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-side-blue/85"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.hash = ''
                window.location.href = '/'
              }}
              className="rounded-lg border border-ink-500 px-4 py-2 text-sm text-fog-300 transition-colors hover:bg-ink-600"
            >
              返回首页
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
