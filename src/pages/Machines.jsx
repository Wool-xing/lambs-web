import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Modal'
import { useDrawer } from '../components/Drawer'
import { fmtTime } from '../utils/time'
import MachineForm from '../components/MachineForm'

const roleMeta = {
  gate: { label: '网关', hint: '公网入口机：nginx 反代 + CF tunnel' },
  compute: { label: '计算', hint: '跑被管项目的机器' },
  data: { label: '数据', hint: '数据库所在机' },
  control: { label: '控制', hint: '管理中枢（Lambs 系统本体）' },
}

function RoleChips({ role }) {
  const roles = (role || '').split(',').map(r => r.trim()).filter(Boolean)
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {roles.map(r => (
        <span key={r} className="chip chip-pa" title={roleMeta[r]?.hint || r} style={{ fontSize: 10 }}>
          {roleMeta[r]?.label || r}
        </span>
      ))}
    </span>
  )
}

function UsageCell({ used, total, unit }) {
  if (!total) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  const pct = used ? Math.min(100, Math.round((used / total) * 100)) : 0
  const color = pct > 85 ? 'var(--accent-red)' : pct > 65 ? 'var(--accent-amber)' : 'var(--accent-cyan)'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
      <span style={{ width: 44, flexShrink: 0 }}>
        {used ? `${used}${unit}` : `容量${total}${unit}`}
      </span>
      <span style={{ flex: 1, height: 4, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden', minWidth: 40 }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </span>
    </span>
  )
}

export default function Machines() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { openDrawer, closeDrawer } = useDrawer()
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [checking, setChecking] = useState(false)
  const isSA = user?.role === 'super_admin'

  const fetchMachines = useCallback(async () => {
    try {
      const res = await api.get('/machines')
      if (res.success) { setMachines(res.data.machines || []); setLoadError(false) }
      else setLoadError(true)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMachines() }, [fetchMachines])

  const handleCheck = async () => {
    if (!isSA) return
    setChecking(true)
    try {
      const res = await api.post('/machines/reconcile')
      const results = res.data?.results || []
      const offline = results.filter(r => r.status === 'offline')
      toast(offline.length ? `检测完成：${offline.length} 台不通（${offline.map(r => r.id).join('、')}）` : `检测完成：${results.length} 台全部连通`)
      fetchMachines()
    } catch (err) { toast(err.message, 'error') }
    finally { setChecking(false) }
  }

  const handleDelete = async (m) => {
    const ok = await confirm('注销机器', `确定从注册表移除「${m.id}」吗？`)
    if (!ok) return
    try { await api.delete(`/machines/${m.id}`); toast('已注销'); fetchMachines() }
    catch (err) { toast(err.message, 'error') }
  }

  if (loading) return (
    <div className="card"><div className="page-skeleton">{[0, 1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 44 }} />)}</div></div>
  )
  if (loadError) return (
    <div className="empty-state">
      <div className="t">机器注册表加载失败</div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { setLoading(true); fetchMachines() }}>重试</button>
    </div>
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">机器注册表</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {machines.filter(m => m.status === 'online').length}/{machines.length} 在线
          </span>
          {isSA && (
            <button className="btn btn-ghost btn-sm" disabled={checking} onClick={handleCheck}>
              {checking ? '检测中…' : '检测连通性'}
            </button>
          )}
          {isSA && (
            <button className="btn btn-primary btn-sm" onClick={() => openDrawer('注册机器', <MachineForm onDone={() => { closeDrawer(); fetchMachines() }} />)}>
              + 注册机器
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {Object.entries(roleMeta).map(([k, v]) => (
          <span key={k} title={v.hint}>{v.label} = {v.hint.split('：')[1] || v.hint}</span>
        ))}
      </div>
      <div className="tbl">
        <div className="tbl-row head" style={{ gridTemplateColumns: '.9fr 1.1fr 1.2fr .9fr 1.1fr 1.1fr .7fr .9fr 1fr' }}>
          <span>机器</span><span>职责</span><span>TS IP</span><span>系统/架构</span><span>内存</span><span>磁盘</span><span>状态</span><span>最后检测</span><span>操作</span>
        </div>
        {machines.map(m => (
          <div key={m.id} className="tbl-row" style={{ gridTemplateColumns: '.9fr 1.1fr 1.2fr .9fr 1.1fr 1.1fr .7fr .9fr 1fr' }}>
            <span data-label="机器" style={{ fontWeight: 500 }}>{m.id}</span>
            <span data-label="职责"><RoleChips role={m.role} /></span>
            <span data-label="TS IP" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{m.ts_ip}</span>
            <span data-label="系统/架构" style={{ fontSize: 11 }}>{m.os}/{m.arch} · {m.cpu_cores}C</span>
            <span data-label="内存"><UsageCell used={m.memory_used_mb} total={m.mem_gb * 1024} unit="MB" /></span>
            <span data-label="磁盘"><UsageCell used={m.disk_used_gb} total={m.disk_gb} unit="G" /></span>
            <span data-label="状态" className={`chip ${m.status === 'online' ? 'chip-online' : m.status === 'maintenance' ? 'chip-vi' : 'chip-offline'}`}>
              {{ online: '在线', offline: '离线', maintenance: '维护中' }[m.status] || m.status}
            </span>
            <span data-label="最后检测" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>{m.last_check_at ? fmtTime(m.last_check_at) : '—'}</span>
            <span data-label="操作" style={{ display: 'flex', gap: 8 }}>
              {isSA ? (
                <>
                  <span className="link-action" onClick={() => openDrawer(`编辑机器·${m.id}`, <MachineForm machineData={m} onDone={() => { closeDrawer(); fetchMachines() }} />)}>编辑</span>
                  <span className="link-action danger" onClick={() => handleDelete(m)}>注销</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>只读</span>
              )}
            </span>
          </div>
        ))}
        {machines.length === 0 && <div className="empty-state"><div className="t">注册表为空</div></div>}
      </div>
    </div>
  )
}
