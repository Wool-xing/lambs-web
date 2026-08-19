import TypeSelect from '../components/TypeSelect'
import { useState, useEffect, useMemo, useRef } from 'react'
import { api, resolveAsset } from '../api/client'
import { useToast } from '../components/Toast'
import { useDebounce } from '../hooks/useDebounce'
import ThemePicker from '../components/ThemePicker'
import Icon from '../components/Icon'
import useFileUpload from '../hooks/useFileUpload'
import { fmtTime } from '../utils/time'

const VERSION = '2.5'

export default function Settings() {
  const toast = useToast()
  const [auditLogs, setAuditLogs] = useState([])
  const [datasources, setDatasources] = useState([])
  const [config, setConfig] = useState({ jwt_secret: '', admin_email: '', port: 3602, refresh_interval: 30 })
  const [initialConfig, setInitialConfig] = useState(null)
  const dirty = initialConfig != null && JSON.stringify(config) !== JSON.stringify(initialConfig)
  const [configLoading, setConfigLoading] = useState(false)
  const [configLoadFailed, setConfigLoadFailed] = useState(false)
  const [showJwt, setShowJwt] = useState(false)
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)
  const [projects, setProjects] = useState([])
  const [exportProject, setExportProject] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [logFilter, setLogFilter] = useState('all')
  const [logoImg, setLogoImg] = useState(localStorage.getItem('lambs_brand_logo_img') || '')

  const onLogoChange = (dataUrl) => {
    setLogoImg(dataUrl || '')
    if (dataUrl) localStorage.setItem('lambs_brand_logo_img', dataUrl)
    else localStorage.removeItem('lambs_brand_logo_img')
    window.dispatchEvent(new Event('lambs-logo-changed'))
    syncBrandLogo(dataUrl || null)
  }
  const logoRef = useRef(null)
  const upload = useFileUpload({ maxMB: 5, onError: (m) => toast(m, 'error'), onChange: onLogoChange })
  const debouncedLogSearch = useDebounce(logSearch)

  useEffect(() => {
    api.get('/settings/audit-logs').then(r => { if (r.success) setAuditLogs(r.data.logs) }).catch(() => {})
    api.get('/settings/datasources').then(r => { if (r.success) setDatasources(r.data.datasources) }).catch(() => {})
    loadConfig()
    api.get('/projects?sort_by=order').then(r => { if (r.success) setProjects(r.data.projects || []) }).catch(() => {})
  }, [])

  // 配置加载失败必须显式降级：静默成功会让表单以默认值显示，
  // 保存 = 用空 jwt_secret 覆写真实配置 (R17)。
  const loadConfig = () => {
    setConfigLoadFailed(false)
    api.get('/settings/config').then(r => {
      if (r.success) { setConfig(r.data); setInitialConfig(r.data) }
      else setConfigLoadFailed(true)
    }).catch(() => setConfigLoadFailed(true))
  }

  const syncBrandLogo = (dataUrl) => {
    if (window.setLambsFavicon) window.setLambsFavicon(dataUrl)
    if (!dataUrl) return  // don't sync empty logo to DB
    const lambs = projects.find(p => p.name === 'Lambs管理系统' || p.name.startsWith('Lambs'))
    if (lambs) api.put(`/projects/${lambs.id}`, { icon_url: dataUrl }).catch(() => {})
  }

  const handleSaveConfig = async () => {
    setConfigLoading(true)
    try {
      await api.put('/settings/config', config)
      setInitialConfig(config)
      toast('配置已保存')
    } catch (err) { toast(err.message, 'error') }
    finally { setConfigLoading(false) }
  }

  const handleExport = (type, projectId) => {
    const token = localStorage.getItem('lambs_token') || sessionStorage.getItem('lambs_token')
    const base = import.meta.env.BASE_URL === '/' ? '/api' : import.meta.env.BASE_URL + 'api'
    let url = `${base}/settings/export/${type}`
    if (projectId) url += `?project_id=${projectId}`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `导出失败 (${res.status})`)
        }
        return res.blob()
      })
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `lambs-${type}${projectId ? '-' + projectId : ''}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
        toast('导出完成')
      })
      .catch(err => toast(err.message || '导出失败', 'error'))
  }

  const filteredLogs = useMemo(() => {
    let logs = auditLogs
    if (logFilter !== 'all') {
      logs = logs.filter(l => l.action === logFilter)
    }
    if (debouncedLogSearch) {
      const s = debouncedLogSearch.toLowerCase()
      // null fields (legacy rows) must not crash the filter (R12).
      logs = logs.filter(l => {
        const target = (l.target || '').toLowerCase()
        const detail = (l.detail || '').toLowerCase()
        const action = (l.action || '').toLowerCase()
        const usr = String(l.user || '').toLowerCase()
        return target.includes(s) || detail.includes(s) || action.includes(s) || usr.includes(s)
      })
    }
    return logs
  }, [auditLogs, logFilter, debouncedLogSearch])

  const logActions = useMemo(() => {
    const set = new Set(auditLogs.map(l => l.action))
    return ['all', ...Array.from(set)]
  }, [auditLogs])

  return (
    <>
      {/* Global Config */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>全局配置</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
          <div className="field">
            <label>JWT 密钥</label>
            <div className="pwd-wrap">
              <input type={showJwt ? 'text' : 'password'} value={config.jwt_secret}
                onChange={e => setConfig({ ...config, jwt_secret: e.target.value })}
                placeholder="JWT 签名密钥" />
              <span className="pwd-eye" onClick={() => setShowJwt(!showJwt)}><Icon name={showJwt ? 'eyeOff' : 'eye'} size={18} /></span>
            </div>
          </div>
          <div className="field">
            <label>管理员邮箱</label>
            <input value={config.admin_email}
              onChange={e => setConfig({ ...config, admin_email: e.target.value })}
              placeholder="admin@lambs.local" />
          </div>
          <div className="field">
            <label>服务端口</label>
            <input value={config.port}
              onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 3602 })} />
          </div>
          <div className="field">
            <label>数据刷新间隔（秒）</label>
            <input value={config.refresh_interval}
              onChange={e => setConfig({ ...config, refresh_interval: parseInt(e.target.value) || 30 })} />
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>品牌 Logo <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（侧边栏左上角显示，PNG/JPG/SVG/WebP，≤5MB）</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="upload-zone" style={{width:56,height:56,borderRadius:7}}
              onClick={() => logoRef.current?.click()}
              onDragOver={e => { e.preventDefault() }}
              onDrop={e => { e.preventDefault(); upload.handleFile(e.dataTransfer.files[0]) }}>
              {logoImg ? <img src={resolveAsset(logoImg)} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:7}} /> : <span className="upload-hint" style={{fontSize:9}}>Logo</span>}
            </div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{display:'none'}}
              onChange={e => upload.handleFile(e.target.files[0])} />
            {logoImg ? <span style={{fontSize:11,color:'var(--accent-red)',cursor:'pointer'}} onClick={() => { upload.reset(); onLogoChange('') }}>移除</span> : <span style={{fontSize:11,color:'var(--text-tertiary)'}}>点击或拖拽上传</span>}
          </div>
        </div>
      </div>

      {/* SMTP Config */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>SMTP 邮件配置 <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:400}}>（用于忘记密码发送验证码）</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px' }}>
          <div className="field">
            <label>SMTP 服务器</label>
            <input value={config.smtp_host || ''} onChange={e => setConfig({ ...config, smtp_host: e.target.value })} placeholder="smtp.qq.com" />
          </div>
          <div className="field">
            <label>端口</label>
            <input value={config.smtp_port || '587'} onChange={e => setConfig({ ...config, smtp_port: e.target.value })} placeholder="587" />
          </div>
          <div className="field">
            <label>发件人地址</label>
            <input value={config.smtp_from || ''} onChange={e => setConfig({ ...config, smtp_from: e.target.value })} placeholder="noreply@example.com" />
          </div>
          <div className="field">
            <label>邮箱账号</label>
            <input value={config.smtp_user || ''} onChange={e => setConfig({ ...config, smtp_user: e.target.value })} placeholder="your-email@example.com" />
          </div>
          <div className="field">
            <label>授权码 / 密码</label>
            <div className="pwd-wrap">
              <input type={showSmtpPassword ? 'text' : 'password'} value={config.smtp_password || ''} onChange={e => setConfig({ ...config, smtp_password: e.target.value })} placeholder="SMTP 授权码（非登录密码）" />
              <span className="pwd-eye" onClick={() => setShowSmtpPassword(!showSmtpPassword)}><Icon name={showSmtpPassword ? 'eyeOff' : 'eye'} size={18} /></span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>数据管理</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => handleExport('projects')}>
            导出项目列表
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleExport('users')}>
            导出系统用户
          </button>
          <TypeSelect value={exportProject} onChange={setExportProject}
            style={{ minWidth: 170 }}
            options={[{ value: '', label: '按项目导出用户' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
          <button className="btn btn-ghost btn-sm"
            onClick={() => { if (exportProject) handleExport(`project-users/${exportProject}`) }}
            disabled={!exportProject}>
            导出
          </button>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>操作日志</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="搜索日志…" value={logSearch}
            onChange={e => setLogSearch(e.target.value)}
            style={{ background:'var(--bg-input)', border:'1px solid var(--border-strong)', borderRadius:7, padding:'7px 11px', color:'var(--text-primary)', fontSize:12, minWidth:180 }} />
          <TypeSelect value={logFilter} onChange={setLogFilter}
            style={{ minWidth: 150 }}
            options={[{ value: 'all', label: '全部操作' }, ...logActions.filter(a => a !== 'all')]} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', alignSelf: 'center' }}>
            共 {filteredLogs.length} 条
          </span>
        </div>
        <div style={{ maxHeight: 220, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-tertiary)', lineHeight: 1.9 }}>
          {filteredLogs.length === 0 ? (
            <span>— 暂无匹配的操作记录 —</span>
          ) : (
            filteredLogs.map(l => (
              <div key={l.id}>
                <span style={{ color: 'var(--accent-cyan)' }}>{fmtTime(l.created_at)}</span>
                {'  '}<span style={{ color: 'var(--accent-amber)', fontWeight: 500 }}>{l.action}</span>
                {'  '}<span style={{ color: 'var(--text-primary)' }}>{l.target}</span>
                {'  '}<span>{l.detail}</span>
                {l.user && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>({l.user})</span>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Theme */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>外观与主题</div>
        <ThemePicker />
      </div>

      {/* Data Sources */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>数据源管理</div>
        <div className="tbl">
          <div className="tbl-row head" style={{ gridTemplateColumns: '1.4fr 1fr .8fr 1fr .8fr' }}>
            <span>项目</span><span>仓库</span><span>类型</span><span>连接</span><span>状态</span>
          </div>
          {datasources.length === 0 ? (
            <div className="empty-state"><div className="t">暂无已注册的数据源</div></div>
          ) : datasources.map(ds => (
            <div key={ds.id} className="tbl-row" style={{ gridTemplateColumns: '1.4fr 1fr .8fr 1fr .8fr' }}>
              <span>{ds.name}</span>
              <span>{ds.repo}</span>
              <span>{ds.stack.split('+')[0].trim()}+{ds.db_type}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{ds.dsn}</span>
              <span className={`chip ${ds.status === 'online' ? 'chip-online' : 'chip-offline'}`}>{ds.status === 'online' ? '已连接' : ds.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Unified save bar — one button for the whole page, at the bottom */}
      <div className="settings-save-bar">
        {configLoadFailed && (
          <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>
            配置加载失败 — 保存已禁用，避免用空值覆写真实配置
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={loadConfig}>重试</button>
          </span>
        )}
        {!configLoadFailed && dirty && <span style={{ fontSize: 11, color: 'var(--accent-amber)' }}>有未保存的更改</span>}
        <button className="btn btn-primary btn-sm" onClick={handleSaveConfig} disabled={configLoading || configLoadFailed}>
          {configLoading ? '保存中…' : '保存配置'}
        </button>
      </div>
    </>
  )
}
