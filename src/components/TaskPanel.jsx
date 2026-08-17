import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useToast } from './Toast'

const STATUS_COLOR = { success: 'var(--accent-green)', failed: 'var(--accent-red)', timeout: 'var(--accent-amber)' }
const STATUS_LABEL = { success: '成功', failed: '失败', timeout: '超时' }

export default function TaskPanel({ projectId, superAdmin }) {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(null) // null | {id?, name, cron, command, host, enabled}
  const [expanded, setExpanded] = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/projects/${projectId}/tasks`)
      if (r.success) setTasks(r.data.tasks || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const openForm = (t) => setForm(t
    ? { id: t.id, name: t.name, cron: t.cron, command: t.command, host: t.host, enabled: t.enabled }
    : { id: '', name: '', cron: '0 2 * * *', command: '', host: 'app1', enabled: true })

  const save = async () => {
    if (!form.name?.trim() || !form.command?.trim()) { toast('任务名和命令不能为空', 'error'); return }
    try {
      if (form.id) await api.put(`/tasks/${form.id}`, form)
      else await api.post(`/projects/${projectId}/tasks`, form)
      setForm(null)
      fetchTasks()
      toast('任务已保存')
    } catch (err) { toast(err.message || '保存失败', 'error') }
  }

  const run = async (t) => {
    try {
      await api.post(`/tasks/${t.id}/run`)
      toast('已触发运行')
      setTimeout(fetchTasks, 1500)
    } catch (err) { toast(err.message || '触发失败', 'error') }
  }

  const toggle = async (t) => {
    try { await api.put(`/tasks/${t.id}`, { ...t, enabled: !t.enabled }); fetchTasks() }
    catch (err) { toast(err.message || '操作失败', 'error') }
  }

  const remove = async (t) => {
    try { await api.delete(`/tasks/${t.id}`); fetchTasks() }
    catch (err) { toast(err.message || '删除失败', 'error') }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          定时执行命令——app1 本机或 Windows compute-agent，失败自动告警
        </span>
        {superAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => openForm(null)}>新建任务</button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: 12, color: 'var(--text-tertiary)' }}>加载中…</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state"><div className="t">暂无计划任务</div></div>
      ) : tasks.map(t => (
        <div key={t.id} className="task-item" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 12 }}>{t.name}</b>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--accent-cyan)' }}>{t.cron}</span>
            <span className="chip" style={{ fontSize: 10 }}>{t.host}</span>
            <span className={`chip ${t.enabled ? 'chip-online' : 'chip-offline'}`} style={{ fontSize: 10 }}>{t.enabled ? '启用' : '停用'}</span>
            {t.last_status && (
              <span style={{ fontSize: 10.5, color: STATUS_COLOR[t.last_status] || 'var(--text-tertiary)' }}>
                {STATUS_LABEL[t.last_status] || t.last_status} · {t.last_run_at?.slice(0, 16)}
              </span>
            )}
            {superAdmin && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => run(t)}>运行</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>日志</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openForm(t)}>编辑</button>
                <button className="btn btn-ghost btn-sm" onClick={() => toggle(t)}>{t.enabled ? '停用' : '启用'}</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>删除</button>
              </span>
            )}
          </div>
          {expanded === t.id && (
            <pre style={{ marginTop: 8, padding: 8, background: 'var(--bg-panel-raised)', borderRadius: 6, fontSize: 10.5, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {t.last_log || '— 暂无日志 —'}
            </pre>
          )}
        </div>
      ))}

      {form && (
        <div className="modal-overlay open" onClick={() => setForm(null)}>
          <form className="modal-box" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); save() }}>
            <div className="modal-title">{form.id ? '编辑任务' : '新建任务'}</div>
            <div className="field">
              <label>任务名</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：每日扫描" autoFocus />
            </div>
            <div className="field">
              <label>cron 表达式</label>
              <input value={form.cron} onChange={e => setForm({ ...form, cron: e.target.value })} placeholder="分 时 日 月 周，如 0 2 * * *" />
            </div>
            <div className="field">
              <label>命令</label>
              <textarea value={form.command} onChange={e => setForm({ ...form, command: e.target.value })}
                placeholder="app1: bash 命令；windows: cmd 命令" rows={3} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 11px', color: 'var(--text-primary)' }} />
            </div>
            <div className="field">
              <label>执行机</label>
              <select value={form.host} onChange={e => setForm({ ...form, host: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 11px', color: 'var(--text-primary)', fontSize: 12 }}>
                <option value="app1">app1（Linux）</option>
                <option value="windows">windows（compute-agent）</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>取消</button>
              <button className="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
