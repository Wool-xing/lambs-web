import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Custom dropdown for datasource types — the native <select> popup cannot be
// styled (browser-drawn), this one matches the app theme with rounded corners.
// The panel is portaled to document.body: ancestor stacking contexts
// (glass cards with backdrop-filter) would otherwise trap it behind later
// siblings no matter how high its z-index is.
const OPTIONS = ['直连 PostgreSQL', '直连 SQLite', 'REST API', 'MySQL', 'MongoDB（文档型）', 'Redis（KV型）', '向量数据库（Qdrant）']

const triggerStyle = {
  width: '100%', height: 37, padding: '0 10px',
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7,
  color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'var(--font-body)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer',
}

const panelStyle = {
  position: 'fixed', zIndex: 9999,
  background: 'var(--bg-panel)', border: '1px solid var(--border-strong)', borderRadius: 10,
  padding: 4, boxShadow: '0 10px 28px rgba(0,0,0,.45)',
}

export default function TypeSelect({ value, onChange, style, options = OPTIONS }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef(null)
  const panelRef = useRef(null)

  // Options may be plain strings or {value,label} pairs.
  const items = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  const current = items.find(o => o.value === value)
  const display = current ? current.label : (value || items[0]?.label || '')

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      const insideTrigger = ref.current && ref.current.contains(e.target)
      const insidePanel = panelRef.current && panelRef.current.contains(e.target)
      if (!insideTrigger && !insidePanel) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const panel = open && (
    <div ref={panelRef} style={{ ...panelStyle, top: pos.top, left: pos.left, minWidth: pos.width }}>
      {items.filter(o => o.value !== '').map(o => (
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
  )

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button type="button" style={triggerStyle} onClick={toggle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {createPortal(panel, document.body)}
    </div>
  )
}
