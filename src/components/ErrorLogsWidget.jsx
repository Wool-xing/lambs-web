import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import Icon from './Icon'
import { fmtTime } from '../utils/time'

// 系统日志 — renders /logs/aggregated (audit + project status lines).
// Note: the endpoint returns a bare array inside data, not {logs: [...]}.
const LEVELS = ['all', 'info', 'warn', 'error']

export default function ErrorLogsWidget() {
  const [logs, setLogs] = useState([])
  const [level, setLevel] = useState('all')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [autoScroll, setAutoScroll] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState(null)
  const bodyRef = useRef(null)

  // silent=true for background polling: refresh data without the "加载中…"
  // flash replacing the list every 30s.
  const fetchLogs = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get('/logs/aggregated?lines=20')
      if (r.success) {
        setLogs(Array.isArray(r.data) ? r.data : [])
        setRefreshedAt(new Date())
      }
    } catch { /* */ }
    finally { if (!silent) setLoading(false) }
  }

  // 30s polling while expanded — near-real-time without websockets.
  useEffect(() => {
    if (!collapsed) fetchLogs()
    const t = setInterval(() => { if (!collapsed) fetchLogs(true) }, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])

  // Follow the tail when auto-scroll is on.
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Scrolling up pauses auto-follow (standard log-panel behavior) — the user
  // is reading history; don't yank them back to the bottom on the next poll.
  const onBodyScroll = () => {
    const el = bodyRef.current
    if (!el || !autoScroll) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (!nearBottom) setAutoScroll(false)
  }

  const filtered = level === 'all' ? logs : logs.filter(l => l.level === level)

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
            title={loading ? '刷新中…' : '刷新'}
            style={{ width: 26, height: 26, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', flexShrink: 0, opacity: loading ? 0.6 : 1 }}
            onClick={e => { e.stopPropagation(); fetchLogs() }} disabled={loading}
          >
            <span className={loading ? 'spin' : ''} style={{ display: 'inline-flex' }}><Icon name="refresh" size={14} /></span>
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{collapsed ? '展开' : '收起'}</span>
        </div>
      </div>
      {!collapsed && (
        <div ref={bodyRef} onScroll={onBodyScroll} style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            {LEVELS.map(lv => (
              <button key={lv}
                onClick={() => setLevel(lv)}
                style={{
                  fontSize: 10, padding: '2px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: level === lv ? 'var(--bg-panel-raised)' : 'transparent',
                  color: level === lv ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}>
                {lv === 'all' ? '全部' : lv.toUpperCase()}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {loading ? '刷新中…' : refreshedAt ? `已刷新 ${refreshedAt.toTimeString().slice(0, 8)}` : ''}
            </span>
            <button
              onClick={() => setAutoScroll(v => !v)}
              title="自动滚动到底部"
              style={{
                fontSize: 10, padding: '2px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: autoScroll ? 'var(--bg-panel-raised)' : 'transparent',
                color: autoScroll ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              }}>
              ⇩ 自动滚动
            </button>
          </div>
          {logs.length === 0 && loading ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>{level === 'all' ? '暂无日志' : `无 ${level.toUpperCase()} 日志`}</div>
          ) : (
            filtered.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 12px', alignItems: 'baseline', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,.03)' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, width: 52 }}>{fmtTime(l.time).slice(11, 16)}</span>
                <span style={{ color: levelColor[l.level] || 'var(--text-secondary)', flexShrink: 0, width: 44, fontWeight: 600 }}>
                  {String(l.level || 'info').toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>[{l.project_name}]</span>
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
