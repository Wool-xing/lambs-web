import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Icon from './Icon'

// 系统日志 — renders /logs/aggregated (audit + project status lines).
// Note: the endpoint returns a bare array inside data, not {logs: [...]}.
export default function ErrorLogsWidget() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const r = await api.get('/logs/aggregated?lines=20')
      if (r.success) setLogs(Array.isArray(r.data) ? r.data : [])
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [])

  const levelColor = {
    error: 'var(--accent-red)',
    warn: 'var(--accent-amber)',
    info: 'var(--text-secondary)',
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => { setCollapsed(!collapsed); if (collapsed) fetchLogs() }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          系统日志
          {logs.length > 0 && (
            <span style={{ fontSize: 10, background: 'var(--bg-panel-raised)', color: 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10 }}>
              {logs.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn-ghost"
            title="刷新"
            style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); fetchLogs() }} disabled={loading}
          >
            <Icon name="refresh" size={14} />
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{collapsed ? '展开' : '收起'}</span>
        </div>
      </div>
      {!collapsed && (
        <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.6 }}>
          {loading ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>暂无日志</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 12px', alignItems: 'baseline', borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,.03)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, width: 52 }}>{(l.time || '').slice(11, 16)}</span>
                <span style={{ color: levelColor[l.level] || 'var(--text-secondary)', flexShrink: 0, width: 44, fontWeight: 600 }}>
                  {String(l.level || 'info').toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {l.message.length > 200 ? l.message.substring(0, 200) + '…' : l.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
