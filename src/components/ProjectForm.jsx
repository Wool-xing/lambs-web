import { useState, useEffect } from 'react'
import { api, resolveAsset } from '../api/client'
import { useToast } from './Toast'
import { useConfirm } from './Modal'
import useFileUpload from '../hooks/useFileUpload'
import TypeSelect from './TypeSelect'

export default function ProjectForm({ onDone, project }) {
  const confirm = useConfirm()

  // 有输入时取消需确认 — 误触丢弃已填表单 (R23)
  const handleCancel = async () => {
    const dirty = !!(name || repo || desc || stack || port || basePath || dss.some(d => d.dsn))
    if (!dirty) { onDone(); return }
    const ok = await confirm('放弃修改', '已填写的内容将丢失，确定取消吗？')
    if (ok) onDone()
  }
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
      return list.map((d, i) => ({ id: d.id || `ds${i + 1}`, name: d.name || '主数据源', type: d.type || '直连 PostgreSQL', dsn: d.dsn || '', is_primary: i === 0 || !!d.is_primary, show: false }))
    }
    return [{ id: 'ds1', name: '主数据源', type: project?.db_type || '直连 PostgreSQL', dsn: project?.dsn || '', is_primary: true, show: false }]
  })
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
    setDss(prev => prev.map((x, xi) => {
      const nx = { ...x, dsn: val }
      // 从连接串前缀自动识别数据源类型，减少新手选错 (QA 第 4 轮)。
      if (xi === i) {
        const scheme = (val.split('://')[0] || '').split('+')[0].toLowerCase()
        const guess = { postgres: '直连 PostgreSQL', postgresql: '直连 PostgreSQL', sqlite: 'SQLite', mysql: 'MySQL', mongodb: 'MongoDB', mongo: 'MongoDB', redis: 'Redis', rest: 'REST API', https: 'REST API', http: 'REST API', qdrant: 'Qdrant', mssql: 'SQL Server' }[scheme]
        if (guess) nx.type = guess
      }
      return nx
    }))
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
  // Row-level controls live outside .field wrappers, so they don't inherit
  // the .field input/select styles — apply them explicitly for equal height.
  const rowCtrl = { padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12.5, fontFamily: 'var(--font-body)' }
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({}) // 字段级校验错误（QA 第 4 轮）

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name) { setErrors({ name: '项目名称为必填' }); return }
    // 仓库名可选：未填时用项目名自动生成 slug 作项目 ID（开源低门槛）。
    const repoFinal = (repo || name).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!repoFinal) { setErrors({ repo: '无法从项目名生成仓库名，请手动填写' }); return }
    // 管理契约：有数据源（数据型）或有 端口+服务信息（服务型）才可管理；
    // 空壳项目（只有名字）数据浏览/备份/进程管理全空 — 拒绝 (QA 第 4 轮深审)。
    const primaryDs = dss[0]
    const hasDsn = !!(primaryDs && primaryDs.dsn && primaryDs.dsn.trim() && primaryDs.dsn !== '—')
    const hasService = !!(port && port !== '—' && (serviceName.trim() || startupCmd.trim()))
    if (!hasDsn && !hasService) {
      setErrors({ dsn: '需填写数据源连接串，或展开高级设置填写端口+服务信息（否则项目无法被管理）' })
      return
    }
    if (port && port !== '—') {
      const pn = parseInt(port, 10)
      if (isNaN(pn) || pn < 1 || pn > 65535) { setErrors({ port: '端口号需在 1-65535 之间' }); return }
    }
    setLoading(true)
    try {
      const datasources = dss.map((d, i) => ({ id: d.id, name: d.name, type: d.type, dsn: d.dsn, is_primary: i === 0 }))
      const primary = datasources[0]
      const services = svcs.filter(s => s.name && s.start_cmd)
      const payload = {
        name, repo: repoFinal, description: desc, stack, port,
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
              style={{ cursor: 'pointer', width: 102, height: 102 }}
            >
              {iconUrl ? (
                <img src={resolveAsset(iconUrl)} alt="" />
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
            <div className="field" style={{ marginBottom: 10 }}>
              <label>项目名称（中文）<span className="req">*</span></label>
              <input value={name} onChange={e => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: '' }) }} placeholder="请输入项目名称" className={errors.name ? 'input-error' : ''} style={{ padding: '8px 12px' }} />
              {errors.name && <div className="field-error-msg">{errors.name}</div>}
            </div>
            {!isEdit ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>服务器目录名<span className="opt">（可选，留空自动生成）</span></label>
                <input value={repo} onChange={e => { setRepo(e.target.value); if (errors.repo) setErrors({ ...errors, repo: '' }) }} name="gh-repo" placeholder="服务器目录名（/home/ubuntu/apps/xxx，也作项目 ID）" className={errors.repo ? 'mono-input input-error' : 'mono-input'} autoComplete="off" style={{ padding: '8px 12px' }} />
                {errors.repo && <div className="field-error-msg">{errors.repo}</div>}
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>状态</label>
                <TypeSelect
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'online', label: '在线' },
                    { value: 'offline', label: '离线' },
                    { value: 'maintenance', label: '维护中' },
                  ]}
                />
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
        <div className="form-section-title">数据源<span className="req">*</span> <span className="hint">连接串必填 — 数据浏览/健康监控/备份都依赖它；纯服务型项目可在高级区配端口+启动命令替代</span></div>
        {dss.map((d, i) => (
          <div key={d.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, padding: '0 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                height: 37, minWidth: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: i === 0 ? 'var(--accent-cyan-dim)' : 'var(--bg-panel-raised)',
                color: i === 0 ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
              }}>
                {i === 0 ? '主源' : '副源'}
              </span>
              <input
                value={d.name}
                onChange={e => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                placeholder="名称（可选）"
                title={d.name}
                style={{ ...rowCtrl, width: 110, flexShrink: 0 }}
              />
              <TypeSelect
                value={d.type}
                onChange={v => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, type: v } : x))}
                style={{ width: 150, flexShrink: 0 }}
              />
              {errors.dsn && i === 0 && <div className="field-error-msg" style={{ flexBasis: '100%' }}>{errors.dsn}</div>}
              {dss.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', flexShrink: 0, padding: '4px 8px' }}
                  onClick={() => setDss(prev => prev.filter((_, xi) => xi !== i))}>删除</button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={d.show ? 'text' : 'password'}
                value={d.dsn}
                onChange={e => onDsnChange(i, e.target.value)}
                placeholder="如 postgres://user:pass@127.0.0.1:5432/db 或 sqlite:///data/app.db"
                className="mono-input"
                autoComplete="new-password"
                title={d.dsn}
                style={{ ...rowCtrl, width: '100%', paddingRight: 30 }}
              />
              <span
                className="pwd-eye"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex' }}
                title={d.show ? '隐藏连接串' : '显示连接串'}
                onClick={() => setDss(prev => prev.map((x, xi) => xi === i ? { ...x, show: !x.show } : x))}
              >
                {d.show ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                )}
              </span>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px' }}
          onClick={() => setDss(prev => [...prev, { id: `ds${prev.length + 1}`, name: '', type: '直连 PostgreSQL', dsn: '', show: false }])}>
          + 添加数据源
        </button>
      </div>

      {/* ── 访问与进程 ── */}
      <div className="form-section">
        <div className="form-section-title">访问与进程</div>
        <div className="form-grid">
          <div className="field">
            <label>服务端口</label>
            <input value={port} onChange={e => { setPort(e.target.value); if (errors.port) setErrors({ ...errors, port: '' }) }} placeholder="留空自动分配" className={errors.port ? 'mono-input input-error' : 'mono-input'} />
            {errors.port && <div className="field-error-msg">{errors.port}</div>}
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
            <input value={startupCmd} onChange={e => setStartupCmd(e.target.value)} placeholder="如: cd /home/ubuntu/apps/myapp && PORT=3000 ./myapp" title={startupCmd} style={{ flex: 1 }} />
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
                  title={s.name}
                  className="mono-input"
                  style={{ ...rowCtrl, width: 100, flexShrink: 0 }}
                />
                <input
                  value={s.start_cmd}
                  onChange={e => setSvcs(prev => prev.map((x, xi) => xi === i ? { ...x, start_cmd: e.target.value } : x))}
                  placeholder="启动命令"
                  title={s.start_cmd}
                  className="mono-input"
                  style={{ ...rowCtrl, flex: 1, minWidth: 0 }}
                />
                <input
                  value={s.stop_cmd}
                  onChange={e => setSvcs(prev => prev.map((x, xi) => xi === i ? { ...x, stop_cmd: e.target.value } : x))}
                  placeholder="停止命令"
                  title={s.stop_cmd}
                  className="mono-input"
                  style={{ ...rowCtrl, flex: 1, minWidth: 0 }}
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
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={handleCancel}>取消</button>
      </div>
    </form>
  )
}
