import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useConfirm } from './Modal'
import TypeSelect from './TypeSelect'
import { useDebounce } from '../hooks/useDebounce'

// DocView — document-oriented (MongoDB) data browser: JSON tree instead of table grid.
// Reuses the same Lambs API endpoints as the relational table view.

// JsonTree — collapsible nested JSON renderer. Auto-expands first 2 levels.
function JsonNode({ k, v, depth }) {
  const isObj = v !== null && typeof v === 'object'
  const [open, setOpen] = useState(depth < 2)
  const pad = { paddingLeft: depth * 16 }
  if (!isObj) {
    const raw = typeof v === 'string' ? `"${v}"` : String(v)
    return (
      <div style={{ ...pad, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7 }}>
        <span style={{ color: 'var(--code-key)' }}>{k}</span>
        <span style={{ color: 'var(--code-punct)' }}>: </span>
        <span style={{ color: typeof v === 'number' ? 'var(--code-num)' : 'var(--code-str)' }}>{raw}</span>
      </div>
    )
  }
  const isArr = Array.isArray(v)
  const count = isArr ? v.length : Object.keys(v).length
  return (
    <div>
      <div style={{ ...pad, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7, userSelect: 'none' }}
        onClick={() => setOpen(!open)}>
        <span style={{ color: open ? 'var(--code-num)' : 'var(--code-punct)' }}>{open ? '▼' : '▶'}</span>
        <span style={{ color: 'var(--code-key)', marginLeft: 4 }}>{k}</span>
        <span style={{ color: 'var(--code-punct)', marginLeft: 6, fontSize: 10.5 }}>{isArr ? `[${count}]` : `{${count}}`}</span>
      </div>
      {open && (isArr
        ? v.map((item, i) => <JsonNode key={i} k={String(i)} v={item} depth={depth + 1} />)
        : Object.entries(v).map(([key, val]) => <JsonNode key={key} k={key} v={val} depth={depth + 1} />)
      )}
    </div>
  )
}

export default function DocView({ id, tableList, selectedTable, onSelectTable, canManageRows, toast, ds }) {
  const [docs, setDocs] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState(null) // { isNew: bool, doc: string(json) }
  const confirm = useConfirm()
  const debouncedSearch = useDebounce(search)
  const PER_PAGE = 15

  // 分页 + 总数，与关系表视图同 API 契约 (R23 大集合首屏)
  const fetchDocs = useCallback((table, pg = 1, q = '') => {
    if (!table) { setDocs(null); return }
    const qs = new URLSearchParams({ table, page: String(pg), page_size: String(PER_PAGE) })
    if (ds) qs.set('ds', ds)
    if (q) qs.set('search', q)
    api.get(`/projects/${id}/tables?${qs}`).then(res => {
      if (res.success) {
        setDocs(res.data.rows || [])
        setTotal(res.data.total || 0)
        setPage(pg)
      }
    }).catch(() => setDocs(null))
  }, [id, ds])

  useEffect(() => { fetchDocs(selectedTable, 1, debouncedSearch) }, [selectedTable, debouncedSearch, fetchDocs])

  // 搜索走服务端（debounced），本地不再重复过滤 — 分页总数才准确

  const saveDoc = async (e) => {
    e.preventDefault()
    let parsed
    try { parsed = JSON.parse(editing.doc) } catch { toast('JSON 格式错误', 'error'); return }
    try {
      if (editing.isNew) {
        await api.post(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}${ds ? `&ds=${ds}` : ''}`, parsed)
        toast('文档已新增', 'success')
      } else {
        const pkVal = parsed._id || editing.pkVal
        const { _id, ...rest } = parsed
        await api.put(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=_id&pkval=${encodeURIComponent(pkVal)}${ds ? `&ds=${ds}` : ''}`, rest)
        toast('文档已更新', 'success')
      }
      setEditing(null)
      fetchDocs(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  const deleteDoc = async (pkVal) => {
    const ok = await confirm('删除文档', `确定删除 _id: ${pkVal} 吗？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.delete(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=_id&pkval=${encodeURIComponent(pkVal)}${ds ? `&ds=${ds}` : ''}`)
      toast('文档已删除', 'success')
      fetchDocs(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="toolbar">
        <div className="toolbar-left">
          <TypeSelect value={selectedTable} onChange={onSelectTable}
            style={{ minWidth: 190 }}
            options={[{ value: '', label: '选择集合…' }, ...tableList]} />
          {docs && (
            <input placeholder={`搜索 ${selectedTable} 文档…`} value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 12, minWidth: 200 }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManageRows && docs && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ isNew: true, doc: '{\n  \n}', pkVal: '' })}>+ 新增文档</button>
          )}
        </div>
      </div>

      {!docs && (
        <div className="empty-state"><div className="t">从上方下拉选择集合开始浏览</div></div>
      )}

      {docs && docs.length === 0 && (
        <div className="empty-state"><div className="t">未找到匹配的文档</div></div>
      )}

      {docs && docs.map(d => {
        const pkVal = d._id ?? ''
        return (
          <div key={String(pkVal)} style={{ background: 'rgba(var(--glass-bg),.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>_id: {String(pkVal)}</span>
              {canManageRows && (
                <span style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => setEditing({ isNew: false, doc: JSON.stringify(d, null, 2), pkVal: String(pkVal) })}>编辑</span>
                  <span style={{ fontSize: 11, color: 'var(--accent-red)', cursor: 'pointer' }} onClick={() => deleteDoc(String(pkVal))}>删除</span>
                </span>
              )}
            </div>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <JsonNode k="(document)" v={d} depth={0} />
            </div>
          </div>
        )
      })}

      {docs && total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
          <span>共 {total} 行 · 第 {page}/{Math.max(1, Math.ceil(total / PER_PAGE))} 页</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => fetchDocs(selectedTable, page - 1, debouncedSearch)}>上一页</button>
            <button className="btn btn-ghost btn-xs" disabled={page >= Math.ceil(total / PER_PAGE)} onClick={() => fetchDocs(selectedTable, page + 1, debouncedSearch)}>下一页</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay open" onClick={() => setEditing(null)}>
          <form className="modal-box" style={{ maxWidth: 520, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()} onSubmit={saveDoc}>
            <div className="modal-title">{editing.isNew ? '新增文档' : '编辑文档'} · {selectedTable}</div>
            <textarea value={editing.doc} onChange={e => setEditing(prev => ({ ...prev, doc: e.target.value }))}
              rows={14}
              style={{ width: '100%', background: 'var(--code-bg)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn-primary btn-sm">{editing.isNew ? '新增' : '保存'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
