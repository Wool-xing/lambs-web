import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useConfirm } from './Modal'

// KVView — Redis key-value data browser. Renders per data type:
// string → single value, hash → field table, list → indexed list,
// set → member chips, zset → member/score table.

const TYPE_LABELS = { string: 'String', hash: 'Hash', list: 'List', set: 'Set', zset: 'ZSet', none: '不存在' }

export default function KVView({ id, tableList, selectedTable, onSelectTable, canManageRows, toast }) {
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [newKey, setNewKey] = useState(false)      // create-key modal
  const [itemForm, setItemForm] = useState(null)   // { type, ...fields } add-item inline
  const [editingStr, setEditingStr] = useState(false)
  const [strVal, setStrVal] = useState('')
  const confirm = useConfirm()

  const fetchRows = useCallback((table) => {
    if (!table) { setRows(null); return }
    api.get(`/projects/${id}/tables?table=${encodeURIComponent(table)}`).then(res => {
      if (res.success) setRows(res.data.rows || [])
    }).catch(() => setRows(null))
  }, [id])

  useEffect(() => { fetchRows(selectedTable); setEditingStr(false) }, [selectedTable, fetchRows])

  const keyType = rows && rows.length > 0 ? rows[0].type : 'none'
  const filtered = (rows || []).filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase().trim()))

  const createKey = async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const key = f.get('key'); const type = f.get('type')
    if (!key) { toast('键名不能为空', 'error'); return }
    const body = { type }
    if (type === 'string') body.value = f.get('value') || ''
    else if (type === 'hash') body.field = f.get('field') || '', body.value = f.get('value') || ''
    else if (type === 'list') body.value = f.get('value') || ''
    else if (type === 'set') body.member = f.get('value') || ''
    else if (type === 'zset') body.member = f.get('value') || '', body.score = f.get('score') || '0'
    try {
      await api.post(`/projects/${id}/data/row?table=${encodeURIComponent(key)}`, body)
      toast('键已创建', 'success')
      setNewKey(false)
      onSelectTable(key)
    } catch (err) { toast(err.message, 'error') }
  }

  const addItem = async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const body = { type: keyType, value: f.get('value') || '', field: f.get('field') || '', member: f.get('member') || '', score: f.get('score') || '0' }
    try {
      await api.post(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}`, body)
      toast('已添加', 'success')
      setItemForm(null)
      fetchRows(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  const saveString = async () => {
    try {
      await api.put(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=key&pkval=${encodeURIComponent(selectedTable)}`, { type: 'string', value: strVal })
      toast('已保存', 'success')
      setEditingStr(false)
      fetchRows(selectedTable)
    } catch (err) { toast(err.message, 'error') }
  }

  const deleteKey = async () => {
    const ok = await confirm('删除键', `确定删除键 ${selectedTable} 吗？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.delete(`/projects/${id}/data/row?table=${encodeURIComponent(selectedTable)}&pk=key&pkval=${encodeURIComponent(selectedTable)}`)
      toast('键已删除', 'success')
      onSelectTable('')
      setRows(null)
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="toolbar">
        <div className="toolbar-left">
          <select value={selectedTable} onChange={e => onSelectTable(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 12 }}>
            <option value="">选择键…</option>
            {tableList.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {rows && (
            <input placeholder="搜索内容…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 12, minWidth: 180 }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManageRows && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setNewKey(true)}>+ 新增键</button>
              {rows && <button className="btn btn-danger btn-sm" onClick={deleteKey}>删除键</button>}
            </>
          )}
        </div>
      </div>

      {!rows && <div className="empty-state"><div className="t">从上方下拉选择键开始浏览</div></div>}

      {rows && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            类型: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{TYPE_LABELS[keyType] || keyType}</span>
          </div>

          {keyType === 'string' && (
            <div style={{ background: 'rgba(22,27,34,.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              {editingStr ? (
                <>
                  <textarea value={strVal} onChange={e => setStrVal(e.target.value)} rows={6}
                    style={{ width: '100%', background: '#0d1117', border: '1px solid var(--border-strong)', borderRadius: 7, padding: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveString}>保存</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingStr(false)}>取消</button>
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#a5d6ff', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {rows[0]?.value ?? '(空)'}
                  {canManageRows && <div style={{ marginTop: 8 }}><button className="btn btn-ghost btn-sm" onClick={() => { setStrVal(rows[0]?.value ?? ''); setEditingStr(true) }}>编辑</button></div>}
                </div>
              )}
            </div>
          )}

          {keyType === 'hash' && (
            <div style={{ background: 'rgba(22,27,34,.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {filtered.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#7ee787' }}>{r.field}</span>
                  <span style={{ flex: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a5d6ff', wordBreak: 'break-all' }}>{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {(keyType === 'list' || keyType === 'set') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((r, i) => (
                <div key={i} style={{ background: 'rgba(22,27,34,.5)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {keyType === 'list' && <span style={{ color: 'var(--text-tertiary)', marginRight: 10 }}>[{r.index}]</span>}
                  <span style={{ color: '#a5d6ff' }}>{keyType === 'list' ? r.value : r.member}</span>
                </div>
              ))}
            </div>
          )}

          {keyType === 'zset' && (
            <div style={{ background: 'rgba(22,27,34,.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              {filtered.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ flex: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a5d6ff' }}>{r.member}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#79c0ff' }}>{r.score}</span>
                </div>
              ))}
            </div>
          )}

          {keyType === 'none' && <div className="empty-state"><div className="t">键不存在或已过期</div></div>}

          {canManageRows && keyType !== 'string' && keyType !== 'none' && (
            <div>
              {itemForm ? (
                <form onSubmit={addItem} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {keyType === 'hash' && <input name="field" placeholder="字段名" required style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12 }} />}
                  <input name="value" placeholder={keyType === 'zset' ? '成员' : '值'} required style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12 }} />
                  {keyType === 'zset' && <input name="score" placeholder="分数" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12, width: 90 }} />}
                  <button className="btn btn-primary btn-sm">添加</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItemForm(null)}>取消</button>
                </form>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setItemForm({})}>+ 添加{keyType === 'hash' ? '字段' : keyType === 'zset' ? '成员' : '项'}</button>
              )}
            </div>
          )}
        </>
      )}

      {newKey && (
        <div className="modal-overlay open" onClick={() => setNewKey(false)}>
          <form className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()} onSubmit={createKey}>
            <div className="modal-title">新增键</div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>键名</label>
              <input name="key" required />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>类型</label>
              <select name="type">
                <option value="string">String（单值）</option>
                <option value="hash">Hash（字段表）</option>
                <option value="list">List（列表）</option>
                <option value="set">Set（集合）</option>
                <option value="zset">ZSet（有序集合）</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>值 / 字段名（hash） / 成员（set/zset）</label>
              <input name="value" />
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewKey(false)}>取消</button>
              <button className="btn btn-primary btn-sm">创建</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
