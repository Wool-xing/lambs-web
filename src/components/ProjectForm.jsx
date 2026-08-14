import { useState } from 'react'
import { api } from '../api/client'
import { useToast } from './Toast'
import useFileUpload from '../hooks/useFileUpload'

export default function ProjectForm({ onDone, project }) {
  const toast = useToast()
  const upload = useFileUpload({ maxMB: 5, onError: (m) => toast(m, 'error') })
  const isEdit = !!project
  const [name, setName] = useState(project?.name || '')
  const [repo, setRepo] = useState(project?.repo || '')
  const [desc, setDesc] = useState(project?.description || '')
  const [stack, setStack] = useState(project?.stack || '')
  const [port, setPort] = useState(project?.port || '')
  const dbType = project?.db_type || '—'
  const [basePath, setBasePath] = useState(project?.base_path || '')
  const [serviceName, setServiceName] = useState(project?.service_name || '')
  const [offlineMsg, setOfflineMsg] = useState(project?.offline_msg || '')
  const [healthUrl, setHealthUrl] = useState(project?.health_url || '')
  const [startupCmd, setStartupCmd] = useState(project?.startup_command || '')
  const [tags, setTags] = useState((project?.tags || []).join(', '))
  const [backupInterval, setBackupInterval] = useState(project?.backup_interval_hours || 0)
  const [backupRetention, setBackupRetention] = useState(project?.backup_retention_days || 0)
  const [status, setStatus] = useState(project?.status || 'online')
  const [dss, setDss] = useState(() => {
    const list = (project?.datasources || [])
    if (list.length > 0) {
      return list.map((d, i) => ({ id: d.id || `ds${i + 1}`, name: d.name || '主数据源', type: d.type || '直连 PostgreSQL', dsn: d.dsn || '', is_primary: i === 0 || !!d.is_primary }))
    }
    return [{ id: 'ds1', name: '主数据源', type: project?.db_type || '直连 PostgreSQL', dsn: project?.dsn || '', is_primary: true }]
  })
  const [showDsn, setShowDsn] = useState(false)
  const iconUrl = upload.preview || project?.icon_url || ''
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !repo) { toast('项目名称和仓库名为必填', 'error'); return }
    if (port && port !== '—') {
      const pn = parseInt(port, 10)
      if (isNaN(pn) || pn < 1 || pn > 65535) { toast('端口号需在 1-65535 之间', 'error'); return }
    }
    setLoading(true)
    try {
      const datasources = dss.map((d, i) => ({ id: d.id, name: d.name, type: d.type, dsn: d.dsn, is_primary: i === 0 }))
      const primary = datasources[0]
      const payload = {
        name, description: desc, stack, port,
        db_type: primary ? primary.type : dbType,
        dsn: primary ? primary.dsn : '',
        datasources,
        base_path: basePath || null, service_name: serviceName || null, startup_command: startupCmd || null,
        health_url: healthUrl || null, offline_msg: offlineMsg || null, icon_url: iconUrl || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        backup_interval_hours: parseInt(backupInterval) || 0, backup_retention_days: parseInt(backupRetention) || 0,
      }
      if (isEdit) {
        await api.put(`/projects/${project.id}`, { ...payload, status })
      } else {
        await api.post('/projects', payload)
      }
      toast(isEdit ? `${name} 已更新` : `${name} 已成功接入`)
      onDone({ name, icon_url: iconUrl || null })
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} autoComplete="off">
      <div className="field">
        <label>项目 Logo</label>
        <div
          className={`upload-zone ${iconUrl ? 'has-image' : ''}`}
          onClick={() => document.getElementById('logo-input')?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation()
            upload.handleFile(e.dataTransfer.files[0])
          }}
          style={{ cursor: 'pointer' }}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" />
          ) : (
            <span className="upload-hint">点击或拖拽上传</span>
          )}
        </div>
        <input id="logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }} onChange={e => upload.handleFile(e.target.files[0])} />
        <div className="upload-info">PNG / JPG / SVG / WebP · 最大 5MB · 建议 512×512</div>
      </div>
      <div className="field">
        <label>项目名称（中文）</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入项目名称" />
      </div>
      {!isEdit && (
        <div className="field">
          <label>GitHub 仓库名</label>
          <input value={repo} onChange={e => setRepo(e.target.value)} name="gh-repo" placeholder="请输入GitHub仓库名" className="mono-input" autoComplete="off" />
        </div>
      )}
      <div className="field">
        <label>项目描述</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="请输入项目描述" />
      </div>
      <div className="field">
        <label>数据源 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（第一个为主数据源，用于连接测试/同步/备份）</span></label>
        {dss.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: i === 0 ? 'var(--accent-cyan)' : 'var(--text-tertiary)', whiteSpace: 'nowrap', minWidth: 44 }}>
              {i === 0 ? '主源' : `源${i + 1}`}
            </span>
            <input
              value={d.name}
              onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
              placeholder="名称"
              style={{ width: 90, flexShrink: 0 }}
            />
            <select
              value={d.type}
              onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, type: e.target.value } : x))}
              style={{ width: 130, flexShrink: 0 }}
            >
              <option>直连 PostgreSQL</option>
              <option>直连 SQLite</option>
              <option>REST API</option>
              <option>MySQL（TCP端口检测，不含数据同步）</option>
              <option>MongoDB（文档型）</option>
              <option>Redis（KV型）</option>
            </select>
            <input
              type={showDsn ? 'password' : 'text'}
              value={d.dsn}
              onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, dsn: e.target.value } : x))}
              placeholder="连接串 / API 地址"
              className="mono-input"
              autoComplete="new-password"
              style={{ flex: 1 }}
            />
            {dss.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '4px 8px' }}
                onClick={() => setDss(prev => prev.filter((_, xi) => xi !== i))}>删除</button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}
            onClick={() => setDss(prev => [...prev, { id: `ds${prev.length + 1}`, name: '', type: '直连 PostgreSQL', dsn: '' }])}>
            + 添加数据源
          </button>
          <span className="pwd-eye" style={{ marginLeft: 'auto' }} onClick={() => setShowDsn(!showDsn)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
        </div>
      </div>
      <div className="field">
        <label>后端技术栈</label>
        <input value={stack} onChange={e => setStack(e.target.value)} placeholder="请输入技术栈" />
      </div>
      <div className="field">
        <label>访问路径 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（如 /my-project，关闭/开启通过此路径控制访问）</span></label>
        <input value={basePath} onChange={e => setBasePath(e.target.value)} placeholder="如 /my-project" className="mono-input" style={{ maxWidth: 220 }} />
      </div>
      <div className="field">
        <label>服务名称 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（systemd 服务名，关闭/开启时自动启停该服务）</span></label>
        <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="如 my-api" className="mono-input" style={{ maxWidth: 200 }} />
      </div>
      <div className="field">
        <label>健康检查 URL <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（填了就用 HTTP 检测，适用于任何项目）</span></label>
        <input value={healthUrl} onChange={e => setHealthUrl(e.target.value)} placeholder="如: http://localhost:3000/health 或 https://myapi.example.com/" />
      </div>
      <div className="field">
        <label>启动命令 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（Lambs 直接管理，留空则走 systemd）</span></label>
        <input value={startupCmd} onChange={e => setStartupCmd(e.target.value)} placeholder="如: cd /home/ubuntu/apps/myapp && PORT=3000 ./myapp" />
      </div>
      <div className="field">
        <label>离线提示语 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（关闭该项目后，用户看到的提示信息）</span></label>
        <input value={offlineMsg} onChange={e => setOfflineMsg(e.target.value)} placeholder="该项目已被管理员暂时关闭，请稍后再试。" />
      </div>
      <div className="field">
        <label>标签 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（逗号分隔，用于分类筛选）</span></label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="如：AI, 后端, 内部工具" />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
            <span key={tag} className="chip" style={{ fontSize: 10 }}>{tag}</span>
          ))}
        </div>
      </div>
      {isEdit && (
        <div className="field">
          <label>状态</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="online">在线</option>
            <option value="offline">离线</option>
            <option value="maintenance">维护中</option>
          </select>
        </div>
      )}
      <div className="field">
        <label>服务端口</label>
        <input value={port} onChange={e => setPort(e.target.value)} placeholder="请输入端口号" className="mono-input" style={{ maxWidth: 120 }} />
      </div>
      <div className="field">
        <label>自动备份间隔 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（小时，0=不自动备份）</span></label>
        <input type="number" min="0" max="720" value={backupInterval} onChange={e => setBackupInterval(e.target.value)} placeholder="如：24" className="mono-input" style={{ maxWidth: 120 }} />
      </div>
      <div className="field">
        <label>备份保留天数 <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（0=永久保留）</span></label>
        <input type="number" min="0" max="3650" value={backupRetention} onChange={e => setBackupRetention(e.target.value)} placeholder="如：30" className="mono-input" style={{ maxWidth: 120 }} />
      </div>
      <div className="drawer-actions">
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
          {loading ? '保存中…' : (isEdit ? '保存' : '确认接入')}
        </button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onDone}>取消</button>
      </div>
    </form>
  )
}
