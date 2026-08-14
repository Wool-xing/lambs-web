import TypeSelect from '../components/TypeSelect'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Modal'
import { useDrawer } from '../components/Drawer'
import { useDebounce } from '../hooks/useDebounce'
import { fmtRelative } from '../utils/time'
import Icon from '../components/Icon'
import ProjectForm from '../components/ProjectForm'
import ErrorLogsWidget from '../components/ErrorLogsWidget'

const ensureArray = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return []
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { openDrawer, closeDrawer } = useDrawer()

  const [stats, setStats] = useState({ total_projects: 0, online: 0, offline: 0, total_users: 0 })
  const [projects, setProjects] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('')
  const [sortBy, setSortBy] = useState('order')
  const [sysHealth, setSysHealth] = useState({ cpu_percent: 0, memory_used_mb: 0, memory_total_mb: 0, disk_used_gb: 0, disk_total_gb: 0, uptime_seconds: 0 })
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [menu, setMenu] = useState(null)
  const [lastRefresh, setLastRefresh] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activityLogs, setActivityLogs] = useState([])
  const [showActivity, setShowActivity] = useState(false)
  const debouncedSearch = useDebounce(search)

  const fetchProjects = useCallback(async () => {
    try {
      const q = new URLSearchParams({ search: debouncedSearch, status: filter, sort_by: sortBy })
      const res = await api.get(`/projects?${q}`)
      if (res.success) {
        let list = res.data.projects
        if (sortBy === 'order') {
          try {
            const saved = JSON.parse(localStorage.getItem('lambs-project-order') || '[]')
            if (saved.length > 0) {
              const orderMap = new Map(saved.map((id, i) => [id, i]))
              list = [...list].sort((a, b) => {
                const ao = orderMap.has(a.id) ? orderMap.get(a.id) : 999
                const bo = orderMap.has(b.id) ? orderMap.get(b.id) : 999
                return ao - bo
              })
            }
          } catch { /* ignore */ }
        }
        setProjects(list)
      }
      const s = await api.get('/projects/stats')
      if (s.success) setStats(s.data)
      const now = new Date()
      setLastRefresh(now.toLocaleTimeString('zh-CN', { hour12: false }))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [debouncedSearch, filter, sortBy])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Auto-refresh stats, project counts, and system health every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      api.get('/projects/stats').then(s => { if (s.success) setStats(s.data) }).catch(() => {})
      api.get('/system/health').then(s => { if (s.success) setSysHealth(s.data) }).catch(() => {})
      api.get('/projects?sort_by=order').then(r => { if (r.success) setProjects(r.data.projects || []) }).catch(() => {})
    }, 30000)
    api.get('/system/health').then(s => { if (s.success) setSysHealth(s.data) }).catch(() => {})
    api.get('/settings/audit-logs').then(r => { if (r.success) setActivityLogs(r.data.logs?.slice(0, 10) || []) }).catch(() => {})
    const actTimer = setInterval(() => {
      api.get('/settings/audit-logs').then(r => { if (r.success) setActivityLogs(r.data.logs?.slice(0, 10) || []) }).catch(() => {})
    }, 30000)
    return () => { clearInterval(timer); clearInterval(actTimer) }
  }, [])

  const refreshDashboard = async () => {
    setRefreshing(true)
    await fetchProjects()
    setTimeout(() => setRefreshing(false), 600)
  }

  // Clean up after project mutations
  const afterMutate = () => {
    closeDrawer()
    setBatchMode(false)
    setSelected(new Set())
    fetchProjects()
    window.dispatchEvent(new Event('lambs-projects-changed'))
  }

  const handleClone = async (id) => {
    try {
      const res = await api.post(`/projects/${id}/clone`)
      if (res.success) {
        toast(`已克隆为「${res.data.name}」`)
        fetchProjects()
        window.dispatchEvent(new Event('lambs-projects-changed'))
      } else toast(res.error || '克隆失败', 'error')
    } catch (err) { toast(err.message, 'error') }
  }

  const handleDelete = async (id, name) => {
    const ok = await confirm('删除项目', `确定删除「${name}」吗？所有数据将被移除。`)
    if (!ok) return
    try {
      await api.delete(`/projects/${id}`)
      toast(`项目「${name}」已删除`)
      afterMutate()
    } catch (err) { toast(err.message, 'error') }
  }

  const handleToggleStatus = async (id) => {
    try {
      const res = await api.patch(`/projects/${id}/status`)
      const s = res.data.status
      toast(s === 'online' ? '已启用' : s === 'maintenance' ? '维护中' : '已停用',
            s === 'online' ? 'success' : s === 'maintenance' ? 'info' : 'warn')
      afterMutate()
    } catch (err) { toast(err.message, 'error') }
  }

  const handleTogglePin = async (id) => {
    try {
      const res = await api.patch(`/projects/${id}/pin`)
      toast(res.data.is_pinned ? '已置顶' : '已取消置顶')
      afterMutate()
    } catch (err) { toast(err.message, 'error') }
  }


  const handleBatchToggle = async (target) => {
    const count = selected.size
    if (count === 0) return
    for (const id of selected) {
      try { await api.patch(`/projects/${id}/status`, { status: target }) } catch { /* skip */ }
    }
    const label = target === 'online' ? '已上线' : target === 'maintenance' ? '已设维护' : '已停用'
    toast(label)
    setBatchMode(false); setSelected(new Set())
    afterMutate()
  }

  const handleBatchDelete = async () => {
    const count = selected.size
    if (count === 0) return
    const ok = await confirm(count >= 2 ? '批量删除' : '删除项目', `确定删除选中的 ${count} 个项目吗？此操作不可恢复。`)
    if (!ok) return
    for (const id of selected) {
      try { await api.delete(`/projects/${id}`) } catch { /* skip */ }
    }
    toast('已删除')
    setBatchMode(false); setSelected(new Set())
    afterMutate()
  }

  const toggleSelect = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => {
    const all = new Set(projects.map(p => p.id))
    setSelected(selected.size === all.size && selected.size > 0 ? new Set() : all)
  }

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDrop = async (e, targetId) => {
    e.preventDefault()
    const srcId = e.dataTransfer.getData('text/plain')
    if (!srcId || srcId === targetId) return
    // Auto-switch to custom order sort when user drags
    if (sortBy !== 'order') setSortBy('order')
    const ordered = projects.map(p => p.id)
    const srcIdx = ordered.indexOf(srcId)
    const tgtIdx = ordered.indexOf(targetId)
    if (srcIdx < 0 || tgtIdx < 0) return
    ordered.splice(srcIdx, 1)
    ordered.splice(tgtIdx, 0, srcId)
    // Optimistic update — save to localStorage per user
    const reordered = [...projects]
    const [item] = reordered.splice(srcIdx, 1)
    reordered.splice(tgtIdx, 0, item)
    setProjects(reordered)
    localStorage.setItem('lambs-project-order', JSON.stringify(ordered))
    window.dispatchEvent(new Event('lambs-projects-changed'))
  }

  const logoInitials = (name) => name.substring(0, 2)

  // Sync Lambs self-project icon to brand logo + favicon
  const syncLambsBrand = (saved) => {
    const n = (saved?.name || '').toLowerCase()
    if (!n.includes('lambs')) return
    if (saved.icon_url) {
      localStorage.setItem('lambs_brand_logo_img', saved.icon_url)
      window.dispatchEvent(new Event('lambs-logo-changed'))
    }
  }

  if (loading) {
    return (
      <>
        <div className="summary-row">
          {[1,2,3,4].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{width:'60%',height:12}} /><div className="skeleton" style={{width:'40%',height:28,marginTop:8}} /><div className="skeleton" style={{width:'80%',height:10,marginTop:6}} /></div>)}
        </div>
        <div className="card">
          <div className="card-title"><div className="skeleton" style={{width:120,height:20}} /></div>
          <div className="project-grid">
            {[1,2,3].map(i => <div key={i} className="project-card"><div className="skeleton" style={{width:'70%',height:16}} /><div className="skeleton" style={{width:'90%',height:12,marginTop:8}} /><div className="skeleton" style={{width:'50%',height:10,marginTop:12}} /></div>)}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Stats */}
      <div className="summary-row">
        <div className="stat-card">
          <div className="k">管理项目总数</div>
          <div className="v">{stats.total_projects}</div>
          <div className="sub">在线 {stats.online} · 离线 {stats.offline}</div>
        </div>
        <div className="stat-card">
          <div className="k">累计注册用户</div>
          <div className="v">{stats.total_users.toLocaleString()}</div>
          <div className="sub">覆盖所有项目</div>
        </div>
        <div className="stat-card">
          <div className="k">活跃数据源</div>
          <div className="v">{stats.online}</div>
          <div className="sub">{stats.online > 0 ? '所有数据源正常连接' : '部分数据源异常'}</div>
        </div>
        <div className="stat-card">
          <div className="k">系统监控</div>
          <div className="v">{sysHealth.cpu_percent}%</div>
          <div className="sub">
            内存 {sysHealth.memory_used_mb}/{sysHealth.memory_total_mb}MB · 磁盘 {sysHealth.disk_used_gb}/{sysHealth.disk_total_gb}GB
          </div>
        </div>
      </div>

      {/* Project card list */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">所有项目</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="filter-chips">
              {['all','online','offline','maintenance'].map(f => (
                <div key={f} className={`f-chip ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}>
                  {f === 'all' ? '全部' : f === 'online' ? '在线' : f === 'offline' ? '离线' : '维护中'}
                </div>
              ))}
            </div>
            {user?.role === 'super_admin' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => { setBatchMode(!batchMode); setSelected(new Set()) }}>
                  {batchMode ? '取消' : '选择'}
                </button>
                <button className="btn btn-primary btn-sm"
                  onClick={() => openDrawer('新增项目', <ProjectForm onDone={(s) => { closeDrawer(); fetchProjects(); syncLambsBrand(s) }} />, 620)}>
                  + 新增项目
                </button>
              </>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input placeholder="搜索项目名称或仓库…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, minWidth: 220 }} />
          <TypeSelect value={sortBy} onChange={setSortBy}
            options={[
              { value: 'order', label: '排序：自定义' },
              { value: 'name', label: '排序：名称' },
              { value: 'users', label: '排序：用户数' },
            ]} />
          <button className="btn btn-ghost btn-sm" onClick={refreshDashboard} disabled={refreshing}>
            {refreshing ? '刷新中…' : '刷新'}
          </button>
          {lastRefresh && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>最后刷新：{lastRefresh}</span>}
        </div>

        {/* Tag filter chips */}
        {(() => {
          const allTags = [...new Set(projects.flatMap(p => ensureArray(p.tags)))].sort()
          if (allTags.length === 0) return null
          return (
            <div className="filter-chips" style={{ marginBottom: 10 }}>
              {allTags.map(t => (
                <div key={t} className={`f-chip ${tagFilter === t ? 'active' : ''}`}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}>{t}</div>
              ))}
              {tagFilter && <div className="f-chip" onClick={() => setTagFilter('')}>✕ 清除</div>}
            </div>
          )
        })()}

        {/* Grid */}
        {(tagFilter ? projects.filter(p => (ensureArray(p.tags)).includes(tagFilter)) : projects).length === 0 ? (
          <div className="empty-state">
            <div style={{opacity:.3}}><Icon name="package" size={40} /></div>
            <div className="t">未找到匹配的项目</div>
            <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:4}}>尝试调整筛选条件或搜索关键词</div>
          </div>
        ) : (
          <div className="project-grid">
            {projects.filter(p => !tagFilter || (ensureArray(p.tags)).includes(tagFilter)).map(p => (
              <div key={p.id}
                className={`project-card ${p.status === 'offline' ? 'disabled' : ''}`}
                onClick={() => batchMode ? toggleSelect(p.id) : navigate(`/project/${p.id}`)}
                draggable={!batchMode}
                onDragStart={e => handleDragStart(e, p.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, p.id)}
              >
                <div className="project-card-header">
                  {batchMode && (
                    <div className={`sel-check ${selected.has(p.id) ? 'checked' : ''}`}
                      onClick={e => { e.stopPropagation(); toggleSelect(p.id) }} />
                  )}
                  <div className={`project-logo ${p.icon_cls || 'default'}`}>
                    {p.icon_url ? <img src={p.icon_url} alt="" /> : logoInitials(p.name)}
                  </div>
                  {!batchMode && (
                    <button className="project-card-more" onClick={e => { e.stopPropagation(); const r=e.currentTarget.getBoundingClientRect(); setMenu({project:p, x:r.right-160, y:r.bottom+4}) }}><Icon name="moreHorizontal" size={16} /></button>
                  )}
                </div>
                <div className="project-card-name" title={p.name}>{p.is_pinned && <><Icon name="star" size={12} /> </>}{p.name}</div>
                <div className="project-card-desc">{p.description}</div>
                {(ensureArray(p.tags)).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, marginBottom: 2 }}>
                    {(ensureArray(p.tags)).map(t => <span key={t} className="chip" style={{ fontSize: 9 }}>{t}</span>)}
                  </div>
                )}
                <div className="project-card-meta">
                  <div className="pcm-item"><span className="kl">端口</span><span className="vl">{p.port}</span></div>
                  <div className="pcm-item"><span className="kl">数据库</span><span className="vl">{p.db_type}</span></div>
                  <div className="pcm-item"><span className="kl">用户</span><span className="vl">{p.users_count}</span></div>
                </div>
                <div className="project-card-status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`ps-dot ${p.status === 'online' ? 'green' : p.status === 'maintenance' ? 'amber' : 'gray'}`} />
                  <span style={{ flex: 1 }}>{p.status === 'online' ? '运行中' : p.status === 'offline' ? '已离线' : '维护中'}</span>
                  {(user?.role === 'super_admin' || user?.role === 'project_admin') && (
                    <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, padding: '2px 8px', opacity: 0.6 }}
                      onClick={e => { e.stopPropagation(); handleToggleStatus(p.id) }}>
                      {p.status === 'online' ? '停用' : p.status === 'maintenance' ? '上线' : '启用'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dropdown menu */}
      {menu && (
        <div className="dropdown" style={{left:menu.x,top:menu.y,opacity:1,pointerEvents:'auto'}} onClick={e=>e.stopPropagation()}>
          <div className="dd-item" onClick={()=>{setMenu(null);openDrawer(`编辑项目·${menu.project.name}`,<ProjectForm project={menu.project} onDone={(s)=>{closeDrawer();fetchProjects();syncLambsBrand(s)}}/>,620)}}>编辑项目</div>
          <div className="dd-item" onClick={()=>{setMenu(null);handleClone(menu.project.id, menu.project.name)}}>克隆项目</div>
          <div className="dd-item" onClick={()=>{setMenu(null);handleToggleStatus(menu.project.id)}}>{menu.project.status === 'online' ? '停用项目' : menu.project.status === 'maintenance' ? '上线项目' : '启用项目'}</div>
          <div className="dd-item" onClick={()=>{setMenu(null);handleTogglePin(menu.project.id)}}>{menu.project.is_pinned?'取消置顶':'置顶项目'}</div>
          <div className="dd-sep" />
          <div className="dd-item danger" onClick={()=>{setMenu(null);handleDelete(menu.project.id,menu.project.name)}}>删除项目</div>
        </div>
      )}
      {/* Click outside to close dropdown */}
      {menu && <div style={{position:'fixed',inset:0,zIndex:29}} onClick={()=>setMenu(null)} />}

      {/* Batch bar */}
      {/* Aggregated error logs */}
      <ErrorLogsWidget />

      {/* Activity timeline */}
      {activityLogs.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowActivity(!showActivity)}>
            <div className="card-title" style={{ marginBottom: 0 }}>最近动态 <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>({activityLogs.length}条)</span></div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showActivity ? '收起' : '展开'}</span>
          </div>
          {showActivity && (<div style={{ position: 'relative', maxHeight: 240, overflow: 'auto', fontSize: 11.5, lineHeight: 1.6, paddingLeft: 18 }}>
            <div style={{ position: 'absolute', left: 4, top: 8, bottom: 8, width: 2, background: 'var(--border)', borderRadius: 1 }} />
            {activityLogs.map((l, i) => {
              const badge = {
                '登录': ['var(--accent-cyan)', 'rgba(0,199,190,.12)'],
                '注册': ['var(--accent-green)', 'rgba(56,210,148,.12)'],
                '删除数据': ['var(--accent-red)', 'rgba(255,107,107,.12)'],
                '删除项目': ['var(--accent-red)', 'rgba(255,107,107,.12)'],
                '删除用户': ['var(--accent-red)', 'rgba(255,107,107,.12)'],
                '重置密码': ['var(--accent-amber)', 'rgba(255,161,59,.12)'],
                '切换状态': ['var(--accent-amber)', 'rgba(255,161,59,.12)'],
                '新增数据': ['var(--accent-green)', 'rgba(56,210,148,.12)'],
                '修改数据': ['var(--accent-cyan)', 'rgba(0,199,190,.12)'],
              }[l.action] || ['var(--text-secondary)', 'var(--bg-panel-raised)']
              const isProjectAction = ['删除项目', '切换状态', '编辑项目', '新增数据', '修改数据', '删除数据'].includes(l.action)
              const jumpTarget = isProjectAction ? `/project/${l.target}` : `/users?search=${encodeURIComponent(l.target)}`
              return (
                <div key={i} style={{ position: 'relative', display: 'flex', gap: 10, padding: '6px 0', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: -17, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: badge[0] }} />
                  <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10, width: 58, flexShrink: 0 }}>{fmtRelative(l.created_at)}</span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {l.target && l.target !== '—' && (
                      <span
                        style={{ color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer' }}
                        title={jumpTarget}
                        onClick={() => navigate(jumpTarget)}
                      >{l.target}</span>
                    )}
                    {l.detail && <span style={{ marginLeft: l.target && l.target !== '—' ? 6 : 0 }}>{l.detail}</span>}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '1px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                    background: badge[1], color: badge[0],
                  }}>{l.action}</span>
                </div>
              )
            })}
            <div style={{ padding: '8px 0 2px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate('/settings')}>查看全部 →</button>
            </div>
          </div>
            )}
        </div>
      )}

      {batchMode && (
        <div className="batch-bar">
          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
            已选 <span style={{ color: 'var(--accent-cyan)' }}>{selected.size}</span> / {projects.length} 项
          </span>
          <button className="btn btn-ghost btn-sm" onClick={selectAll}>
            {selected.size === projects.length && selected.size > 0 ? '取消全选' : '全选'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={selected.size === 0}
            onClick={() => handleBatchToggle('online')}>{selected.size >= 2 ? '批量上线' : '上线'}</button>
          <button className="btn btn-ghost btn-sm" disabled={selected.size === 0}
            onClick={() => handleBatchToggle('offline')}>{selected.size >= 2 ? '批量停用' : '停用'}</button>
          <button className="btn btn-ghost btn-sm" disabled={selected.size === 0}
            onClick={() => handleBatchToggle('maintenance')}>{selected.size >= 2 ? '批量维护' : '维护中'}</button>
          <button className="btn btn-danger btn-sm" disabled={selected.size === 0}
            onClick={() => handleBatchDelete()}>{selected.size >= 2 ? '批量删除' : '删除'}</button>
        </div>
      )}
    </>
  )
}
