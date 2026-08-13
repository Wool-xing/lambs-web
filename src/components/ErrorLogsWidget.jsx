import { useState, useEffect } from 'react'
import { api } from '../api/client'

export default function ErrorLogsWidget() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const r = await api.get('/logs/aggregated?lines=20&level=error')
      if (r.success) setLogs(r.data.logs || [])
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [])

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => { setCollapsed(!collapsed); if (collapsed) fetchLogs() }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          系统日志
          {logs.length > 0 && (
            <span style={{ fontSize: 10, background: 'var(--accent-red-dim)', color: 'var(--accent-red)', padding: '2px 8px', borderRadius: 10 }}>
              {logs.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{collapsed ? '展开' : '收起'}</span>
      </div>
      {!collapsed && (
        <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.6 }}>
          {loading ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--accent-green)' }}>✅ 所有服务正常运行</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} style={{ padding: '3px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--accent-cyan)', marginRight: 6 }}>[{l.project_name}]</span>
                <span style={{ color: l.level === 'error' ? 'var(--accent-red)' : 'var(--accent-amber)' }}>
                  {l.message.length > 200 ? l.message.substring(0, 200) + '...' : l.message}
                </span>
              </div>
            ))
          )}
          <div style={{ padding: '4px 12px' }}>
            <button className="btn btn-ghost btn-xs" onClick={fetchLogs} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
