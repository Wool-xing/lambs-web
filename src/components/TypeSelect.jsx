import { useState, useRef, useEffect } from 'react'

// Custom dropdown for datasource types — the native <select> popup cannot be
// styled (browser-drawn), this one matches the app theme with rounded corners.
const OPTIONS = ['直连 PostgreSQL', '直连 SQLite', 'REST API', 'MySQL', 'MongoDB（文档型）', 'Redis（KV型）', '向量数据库（Qdrant）']

const triggerStyle = {
  width: '100%', height: 37, padding: '0 10px',
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7,
  color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'var(--font-body)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer',
}

export default function TypeSelect({ value, onChange, style, options = OPTIONS }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Options may be plain strings or {value,label} pairs.
  const items = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  const current = items.find(o => o.value === value)
  const display = current ? current.label : (value || items[0]?.label || '')

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button type="button" style={triggerStyle} onClick={() => setOpen(v => !v)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%', zIndex: 30,
          background: 'var(--bg-panel)', border: '1px solid var(--border-strong)', borderRadius: 10,
          padding: 4, boxShadow: '0 10px 28px rgba(0,0,0,.45)',
        }}>
          {items.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12.5,
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: o.value === value ? 'rgba(0,199,190,.12)' : 'transparent',
                color: o.value === value ? 'var(--accent-cyan)' : 'var(--text-primary)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
