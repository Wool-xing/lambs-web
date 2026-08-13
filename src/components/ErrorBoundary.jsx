import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: 'var(--bg-deep)', color: 'var(--text-primary)', gap: 16
        }}>
          <div style={{ fontSize: 48 }}>⚠</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>页面出错了</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || '发生了未知错误'}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { this.setState({ hasError: false }); window.location.href = '/lambs/dashboard' }}>
            返回仪表盘
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
