import { useState, useEffect } from 'react'
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [svcs, setSvcs] = useState(() => (project?.services || []).map(s => ({ name: s.name || '', start_cmd: s.start_cmd || '', stop_cmd: s.stop_cmd || '' })))
  const [detecting, setDetecting] = useState(false)

  // Shared-service auto-detection: only for units that really exist on the
  // server and are NOT system-critical (Lambs' own postgres etc).
  const [localServices, setLocalServices] = useState([])
  useEffect(() => {
    api.get('/runtime/local-services').then(r => {
      if (r.success) setLocalServices(r.data.services || [])
    }).catch(() => {})
  }, [])
  const SCHEME_UNIT = { mysql: 'mysql', redis: 'redis-server', postgres: 'postgresql', mongodb: 'mongod' }
  const guessSharedService = (dsn) => {
    try {
      const u = new URL(dsn)
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return null
      const scheme = (dsn.split('://')[0] || '').split('+')[0].toLowerCase()
      const unit = SCHEME_UNIT[scheme]
      if (!unit) return null
      const svc = localServices.find(s => s.name === unit)
      if (!svc) {
        toast(`本机未安装 ${scheme} 服务，仅记录连接串`, 'info')
        return null
      }
      if (!svc.managed) {
        toast(`本机 ${scheme} 是系统依赖服务，不可按需管理，仅记录连接串`, 'warn')
        return null
      }
      return { name: `${unit}-shared`, start_cmd: `sudo systemctl start ${svc.unit}`, stop_cmd: `sudo systemctl stop ${svc.unit}` }
    } catch { return null }
  }
  const onDsnChange = (i, val) => {
    setDss(prev => prev.map((x, xi) => xi === i ? { ...x, dsn: val } : x))
    const g = guessSharedService(val)
    if (g) {
      setSvcs(prev => prev.some(s => s.name === g.name) ? prev : [...prev, g])
    }
  }
  const handleDetect = async () => {
    if (!repo) { toast('请先填写仓库名', 'error'); return }
    setDetecting(true)
    try {
      const res = await api.post('/runtime/detect', { repo })
      if (res.success && res.data.exists && res.data.candidates.length > 0) {
        setStartupCmd(res.data.candidates[0].replace('PORT', port || '3510'))
        toast(`检测到 ${res.data.candidates.length} 个候选，已填入第一个（${res.data.candidates[0].split('&&').pop().trim().split(' ')[0]}）`)
      } else if (res.success && !res.data.exists) {
        toast('服务器上未找到该项目目录（/home/ubuntu/apps/' + repo + '），请先部署代码', 'warn')
      } else {
        toast('未识别到启动方式，请手动填写', 'warn')
      }
    } catch (err) { toast(err.message, 'error') }
    finally { setDetecting(false) }
  }
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
      const services = svcs.filter(s => s.name && s.start_cmd)
      const payload = {
        name, repo, description: desc, stack, port,
        db_type: primary ? primary.type : dbType,
        dsn: primary ? primary.dsn : '',
        datasources,
        services,
        base_path: basePath || (isEdit ? null : `/${repo}`), service_name: serviceName || null, startup_command: startupCmd || null,
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
      {/* ── 基本信息 ── */}
      <div className="form-section">
        <div className="form-section-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>基本信息</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Logo</label>
            <div
              className={`upload-zone ${iconUrl ? 'has-image' : ''}`}
              onClick={() => document.getElementById('logo-input')?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation()
                upload.handleFile(e.dataTransfer.files[0])
              }}
              style={{ cursor: 'pointer', width: 96, height: 96 }}
            >
              {iconUrl ? (
                <img src={iconUrl} alt="" />
              ) : (
                <>
                  <span className="upload-hint">点击上传</span>
                  <span className="upload-info" style={{ fontSize: 9, marginTop: 0, zIndex: 1, position: 'relative', textAlign: 'center', lineHeight: 1.3 }}>PNG/JPG/SVG/WebP · 5MB</span>
                </>
              )}
            </div>
            <input id="logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }} onChange={e => upload.handleFile(e.target.files[0])} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="field">
              <label>项目名称（中文）</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入项目名称" />
            </div>
            {!isEdit ? (
              <div className="field">
                <label>GitHub 仓库名</label>
                <input value={repo} onChange={e => setRepo(e.target.value)} name="gh-repo" placeholder="请输入GitHub仓库名" className="mono-input" autoComplete="off" />
              </div>
            ) : (
              <div className="field">
                <label>状态</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="online">在线</option>
                  <option value="offline">离线</option>
                  <option value="maintenance">维护中</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>项目描述</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="请输入项目描述" rows={2} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>后端技术栈</label>
            <input value={stack} onChange={e => setStack(e.target.value)} placeholder="请输入技术栈" />
          </div>
          <div className="field">
            <label>标签 <span className="hint">逗号分隔</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="如：AI, 后端, 内部工具" />
          </div>
        </div>
      </div>

      {/* ── 数据源（核心）── */}
      <div className="form-section">
        <div className="form-section-title">数据源 <span className="hint">第一个为主数据源 · 驱动连接测试/同步/备份</span></div>
        {dss.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
              background: i === 0 ? 'rgba(0,199,190,.12)' : 'var(--bg-panel-raised)',
              color: i === 0 ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
            }}>
              {i === 0 ? '主源' : '副源'}
            </span>
            <input
              value={d.name}
              onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
              placeholder="名称（可选）"
              style={{ width: 84, flexShrink: 0 }}
            />
            <select
              value={d.type}
              onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, type: e.target.value } : x))}
              style={{ width: 124, flexShrink: 0 }}
            >
              <option>直连 PostgreSQL</option>
              <option>直连 SQLite</option>
              <option>REST API</option>
              <option>MySQL</option>
              <option>MongoDB（文档型）</option>
              <option>Redis（KV型）</option>
              <option>向量数据库（Qdrant）</option>
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input
                type={showDsn ? 'text' : 'password'}
                value={d.dsn}
                onChange={e => onDsnChange(i, e.target.value)}
                placeholder="连接串 / API 地址"
                className="mono-input"
                autoComplete="new-password"
                style={{ width: '100%', paddingRight: 30 }}
              />
              <span
                className="pwd-eye"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}
                title={showDsn ? '隐藏连接串' : '显示连接串'}
                onClick={() => setShowDsn(!showDsn)}
              >
                {showDsn ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                )}
              </span>
            </div>
            {dss.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '4px 8px' }}
                onClick={() => setDss(prev => prev.filter((_, xi) => xi !== i))}>删除</button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}
          onClick={() => setDss(prev => [...prev, { id: `ds${prev.length + 1}`, name: '', type: '直连 PostgreSQL', dsn: '' }])}>
          + 添加数据源
        </button>
      </div>

      {/* ── 访问与进程 ── */}
      <div className="form-section">
        <div className="form-section-title">访问与进程</div>
        <div className="form-grid">
          <div className="field">
            <label>服务端口</label>
            <input value={port} onChange={e => setPort(e.target.value)} placeholder="留空自动分配" className="mono-input" />
          </div>
          <div className="field">
            <label>访问路径 <span className="hint">闸门控制</span></label>
            <input value={basePath} onChange={e => setBasePath(e.target.value)} placeholder="如 /my-project" className="mono-input" />
          </div>
          <div className="field">
            <label>服务名称 <span className="hint">systemd</span></label>
            <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="如 my-api" className="mono-input" />
          </div>
          <div className="field">
            <label>健康检查 URL <span className="hint">可选</span></label>
            <input value={healthUrl} onChange={e => setHealthUrl(e.target.value)} placeholder="如 http://localhost:3000/health" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>启动命令 <span className="hint">留空则走 systemd</span></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={startupCmd} onChange={e => setStartupCmd(e.target.value)} placeholder="如: cd /home/ubuntu/apps/myapp && PORT=3000 ./myapp" style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={handleDetect} disabled={detecting}>
              {detecting ? '检测中…' : '检测'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>「检测」扫描服务器 /home/ubuntu/apps/&lt;仓库名&gt; 目录的启动物并回填候选</div>
        </div>
        <div className="field">
          <label>离线提示语</label>
          <input value={offlineMsg} onChange={e => setOfflineMsg(e.target.value)} placeholder="该项目已被管理员暂时关闭，请稍后再试。" />
        </div>
      </div>

      {/* ── 备份 ── */}
      <div className="form-section">
        <div className="form-section-title">备份</div>
        <div className="form-grid">
          <div className="field">
            <label>自动备份间隔 <span className="hint">小时 · 0=关</span></label>
            <input type="number" min="0" max="720" value={backupInterval} onChange={e => setBackupInterval(e.target.value)} placeholder="如：24" className="mono-input" />
          </div>
          <div className="field">
            <label>备份保留天数 <span className="hint">0=永久</span></label>
            <input type="number" min="0" max="3650" value={backupRetention} onChange={e => setBackupRetention(e.target.value)} placeholder="如：30" className="mono-input" />
          </div>
        </div>
      </div>

      {/* ── 高级：共享服务（折叠）── */}
      <div className="form-section">
        <button type="button" className="form-section-title" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0, marginBottom: showAdvanced ? 12 : 0 }}
          onClick={() => setShowAdvanced(v => !v)}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12, transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▶</span>
          共享服务（按需）
          <span className="hint">多项目同服务名 = 共享实例 · 填 127.0.0.1 连接串自动识别</span>
        </button>
        {showAdvanced && (
          <>
            {svcs.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  value={s.name}
                  onChange={e => setSvcs(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                  placeholder="服务名"
                  className="mono-input"
                  style={{ width: 100, flexShrink: 0 }}
                />
                <input
                  value={s.start_cmd}
                  onChange={e => setSvcs(prev => prev.map((x, xi) => xi === i ? { ...x, start_cmd: e.target.value } : x))}
                  placeholder="启动命令"
                  className="mono-input"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <input
                  value={s.stop_cmd}
                  onChange={e => setSvcs(prev => prev.map((x, xi) => xi === i ? { ...x, stop_cmd: e.target.value } : x))}
                  placeholder="停止命令"
                  className="mono-input"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '4px 6px' }}
                  onClick={() => setSvcs(prev => prev.filter((_, xi) => xi !== i))}>删除</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}
              onClick={() => setSvcs(prev => [...prev, { name: '', start_cmd: '', stop_cmd: '' }])}>
              + 添加共享服务
            </button>
          </>
        )}
      </div>

      <div className="form-actions-sticky">
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
          {loading ? '保存中…' : (isEdit ? '保存' : '确认接入')}
        </button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onDone}>取消</button>
      </div>
    </form>
  )
}
