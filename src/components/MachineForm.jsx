import { useState } from 'react'
import { api } from '../api/client'
import { useToast } from './Toast'
import TypeSelect from './TypeSelect'

const ROLE_OPTIONS = [
  { key: 'gate', label: '网关', hint: '公网入口机' },
  { key: 'compute', label: '计算', hint: '跑项目' },
  { key: 'data', label: '数据', hint: '数据库' },
  { key: 'control', label: '控制', hint: '管理中枢' },
]

export default function MachineForm({ onDone, machineData }) {
  const toast = useToast()
  const isEdit = !!machineData
  const [id, setId] = useState(machineData?.id || '')
  const [roles, setRoles] = useState(() => (machineData?.role || '').split(',').map(r => r.trim()).filter(Boolean))
  const [tsIp, setTsIp] = useState(machineData?.ts_ip || '')
  const [lanIp, setLanIp] = useState(machineData?.lan_ip || '')
  const [os, setOs] = useState(machineData?.os || 'ubuntu')
  const [arch, setArch] = useState(machineData?.arch || 'amd64')
  const [cpu, setCpu] = useState(machineData?.cpu_cores ?? 1)
  const [mem, setMem] = useState(machineData?.mem_gb ?? 1)
  const [disk, setDisk] = useState(machineData?.disk_gb ?? 20)
  const [tags, setTags] = useState(() => {
    if (!machineData?.tags) return ''
    if (Array.isArray(machineData.tags)) return machineData.tags.join(',')
    return machineData.tags
  })
  const [status, setStatus] = useState(machineData?.status || 'online')
  const [notes, setNotes] = useState(machineData?.notes || '')
  const [loading, setLoading] = useState(false)

  const parseTags = () => tags.split(',').map(t => t.trim()).filter(Boolean)
  const toggleRole = (key) => setRoles(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!id) { toast('机器名必填', 'error'); return }
    if (!tsIp) { toast('Tailscale IP 必填', 'error'); return }
    if (!roles.length) { toast('至少选一个职责', 'error'); return }
    setLoading(true)
    try {
      await api.post('/machines', {
        id, role: roles.join(','), ts_ip: tsIp, lan_ip: lanIp, os, arch,
        cpu_cores: Number(cpu) || 0, mem_gb: Number(mem) || 0, disk_gb: Number(disk) || 0,
        tags: parseTags(), status, notes,
      })
      toast(`${id} 已${isEdit ? '更新' : '注册'}`)
      onDone()
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  const groupTitle = (t) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '14px 0 8px', borderTop: '1px solid var(--border)', paddingTop: 12 }}>{t}</div>
  )

  return (
    <form onSubmit={handleSubmit}>
      {groupTitle('身份')}
      <div className="field">
        <label>机器名（hostname）<span className="req">*</span></label>
        <input value={id} disabled={isEdit} onChange={e => setId(e.target.value)} placeholder="如 wool / sheep / laptop" className="mono-input" />
      </div>
      <div className="field">
        <label>状态</label>
        <TypeSelect
          value={{ online: '在线', offline: '离线', maintenance: '维护中' }[status]}
          onChange={v => setStatus({ '在线': 'online', '离线': 'offline', '维护中': 'maintenance' }[v])}
          options={['在线', '离线', '维护中']}
        />
      </div>

      {groupTitle('网络')}
      <div className="field">
        <label>Tailscale IP<span className="req">*</span></label>
        <input value={tsIp} onChange={e => setTsIp(e.target.value)} placeholder="100.x.x.x" className="mono-input" />
      </div>
      <div className="field">
        <label>内网 IP</label>
        <input value={lanIp} onChange={e => setLanIp(e.target.value)} placeholder="10.x.x.x（无则留空）" className="mono-input" />
      </div>

      {groupTitle('容量')}
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>系统</label>
          <TypeSelect value={os} onChange={v => setOs(v)} options={['ubuntu', 'windows', 'debian', 'other']} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>架构</label>
          <TypeSelect value={arch} onChange={v => setArch(v)} options={['amd64', 'arm64']} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>CPU 核数</label>
          <input type="number" min="0" value={cpu} onChange={e => setCpu(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>内存 GB</label>
          <input type="number" min="0" value={mem} onChange={e => setMem(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>磁盘 GB</label>
          <input type="number" min="0" value={disk} onChange={e => setDisk(e.target.value)} />
        </div>
      </div>

      {groupTitle('职责')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ROLE_OPTIONS.map(r => (
          <span
            key={r.key}
            onClick={() => toggleRole(r.key)}
            title={r.hint}
            className={`chip ${roles.includes(r.key) ? 'chip-pa' : ''}`}
            style={{ cursor: 'pointer', userSelect: 'none', fontSize: 12, padding: '5px 12px', opacity: roles.includes(r.key) ? 1 : 0.45 }}
          >
            {r.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
        网关=公网入口 · 计算=跑项目 · 数据=数据库 · 控制=管理中枢（可多选）
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>标签（逗号分隔）</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="oci,free-tier,arm" className="mono-input" />
      </div>
      <div className="field">
        <label>备注</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="用途/注意事项" />
      </div>

      <div className="drawer-actions">
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
          {loading ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onDone}>取消</button>
      </div>
    </form>
  )
}
