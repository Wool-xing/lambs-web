import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useConfirm } from './Modal'
import TypeSelect from './TypeSelect'

// VectorView — vector-database (Qdrant) data browser:
// collection select + points table + similarity search panel.
export default function VectorView({ id, tableList, selectedTable, onSelectTable, canManageRows, toast, ds }) {
  const confirm = useConfirm()
  const [tableData, setTableData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchTopK, setSearchTopK] = useState(5)
  const [hits, setHits] = useState(null)
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState(null) // { id, payloadJson }

  const dsParam = ds ? `&ds=${ds}` : ''

  const fetchTableData = useCallback((table, pg = 1) => {
    if (!table) { setTableData(null); return }
    setLoading(true)
    const qs = new URLSearchParams({ table, page: String(pg), page_size: '15' })
    if (ds) qs.set('ds', ds)
    api.get(`/projects/${id}/tables?${qs}`).then(res => {
      if (res.success) { setTableData({ name: table, pk: res.data.pk, cols: res.data.columns, rows: res.data.rows }); setTotal(res.data.total || 0); setPage(pg) }
    }).catch(() => setTableData(null)).finally(() => setLoading(false))
  }, [id, ds])

  useEffect(() => {
    fetchTableData(selectedTable)
    setHits(null)
  }, [selectedTable, fetchTableData])

  const handleSearch = async () => {
    let vector
    try {
      vector = JSON.parse(searchInput)
      if (!Array.isArray(vector) || vector.length === 0 || typeof vector[0] !== 'number') throw new Error('x')
    } catch {
      toast('请输入向量 JSON 数组，如 [0.1, 0.2, 0.3]', 'error')
      return
    }
    setSearching(true)
    try {
      const res = await api.post(`/projects/${id}/vector-search`, { ds: ds || undefined, collection: selectedTable, vector, top_k: searchTopK })
      if (res.success) setHits(res.data.hits || [])
    } catch (err) { toast(err.message, 'error') }
    finally { setSearching(false) }
  }

  const handleEdit = (row) => {
    const payload = { ...row }
    delete payload.id
    setEditing({ id: row.id, json: JSON.stringify(payload, null, 2) })
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    let payload
    try { payload = JSON.parse(editing.json) } catch { toast('JSON 格式错误', 'error'); return }
    try {
      await api.put(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=id&pkval=${encodeURIComponent(editing.id)}${dsParam}`, payload)
      toast('已更新')
      setEditing(null)
      fetchTableData(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  const handleDelete = async (row) => {
    const ok = await confirm('删除向量点', `确定删除 id=${row.id} 吗？`)
    if (!ok) return
    try {
      await api.delete(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=id&pkval=${encodeURIComponent(row.id)}${dsParam}`)
      toast('已删除')
      fetchTableData(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  const cols = tableData?.cols || []
  const rows = tableData?.rows || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="toolbar">
        <div className="toolbar-left">
          <TypeSelect value={selectedTable} onChange={onSelectTable}
            style={{ minWidth: 190 }}
            options={[{ value: '', label: '选择集合…' }, ...tableList]} />
          {tableData && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rows.length} 个向量点</span>}
        </div>
        {canManageRows && tableData && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ id: '', json: '{}' })}>+ 新增向量点</button>
          </div>
        )}
      </div>

      {/* Similarity search panel */}
      {selectedTable && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'rgba(var(--glass-bg),.4)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>相似度检索 · 输入向量（JSON 数组）</div>
            <textarea value={searchInput} onChange={e => setSearchInput(e.target.value)} rows={2}
              placeholder='[0.1, 0.2, 0.3, ...]'
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ width: 90 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Top K</div>
            <input type="number" min="1" max="100" value={searchTopK} onChange={e => setSearchTopK(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12 }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSearch} disabled={searching}>{searching ? '检索中…' : '检索'}</button>
        </div>
      )}

      {/* Search results */}
      {hits && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' }}>
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            检索结果 · {hits.length} 条
          </div>
          {hits.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>无匹配结果</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{Object.keys(hits[0]).map(k => <th key={k} style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {hits.map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    {Object.keys(hits[0]).map(k => <td key={k} style={{ padding: '6px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{typeof h[k] === 'object' ? JSON.stringify(h[k]) : String(h[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Points table */}
      {tableData ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>{cols.map(c => <th key={c} style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{c}</th>)}{canManageRows && <th style={{ padding: 6 }}></th>}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                  {cols.map(c => <td key={c} style={{ padding: '6px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}</td>)}
                  {canManageRows && (
                    <td style={{ padding: 6, display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(row)}>编辑</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(row)} style={{ color: 'var(--accent-red)' }}>删除</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>集合为空</div>}
        </div>
      ) : (
        !loading && <div className="empty-state"><div className="t">从上方下拉选择集合开始浏览</div></div>
      )}

      {/* Edit / Insert modal */}
      {editing && (
        <div className="modal-overlay open" onClick={() => setEditing(null)}>
          <form className="modal-box" style={{ maxWidth: 460, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()} onSubmit={saveEdit}>
            <div className="modal-title">{editing.id ? `编辑向量点 · ${editing.id}` : '新增向量点'}</div>
            <div className="modal-desc">payload JSON（不含 id 字段）。检索需要 vector 字段时一并写入。</div>
            <textarea value={editing.json} onChange={e => setEditing({ ...editing, json: e.target.value })} rows={10}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn-primary">{editing.id ? '保存' : '新增'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
