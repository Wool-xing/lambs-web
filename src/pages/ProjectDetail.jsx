import TypeSelect from '../components/TypeSelect'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Modal'
import { useDrawer } from '../components/Drawer'
import ProjectForm from '../components/ProjectForm'
import DocView from '../components/DocView'
import KVView from '../components/KVView'
import VectorView from '../components/VectorView'
import Icon from '../components/Icon'
import { fmtTime } from '../utils/time'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { openDrawer, closeDrawer } = useDrawer()
  const [editingRow, setEditingRow] = useState(null) // { tabIdx, rowIdx, values: {} }
  const [project, setProject] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [procStats, setProcStats] = useState(null)
  const [connResult, setConnResult] = useState(null)
  const [testingConn, setTestingConn] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [adminMode, setAdminMode] = useState('data') // 'data' | 'members' | 'logs'
  const [tableList, setTableList] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [selectedDS, setSelectedDS] = useState('')
  const [tableData, setTableData] = useState(null) // { name, pk, cols, rows }
  const [selectedPKs, setSelectedPKs] = useState(new Set())
  const [liveSearch, setLiveSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [liveSort, setLiveSort] = useState(null) // { col, dir }
  const [livePage, setLivePage] = useState(1)
  const [liveColWidths, setLiveColWidths] = useState({})
  const [members, setMembers] = useState([])
  const [nonMembers, setNonMembers] = useState([])
  const [backups, setBackups] = useState([])
  const [backupLoading, setBackupLoading] = useState(false)
  const PER_PAGE = 15

  const syncLambsBrand = (saved) => {
    if (!saved) return
    const name = (saved.name || '').toLowerCase()
    if (!name.includes('lambs')) return
    if (saved.icon_url) {
      localStorage.setItem('lambs_brand_logo_img', saved.icon_url)
      window.dispatchEvent(new Event('lambs-logo-changed'))
    }
  }

  const projectReqSeq = useRef(0)

  const fetchProject = async () => {
    const seq = ++projectReqSeq.current
    try {
      const res = await api.get(`/projects/${id}`)
      // Stale-response guard: a slow response for a previously visited
      // project must not overwrite the current one or fire a wrong redirect
      // (R12, same pattern as the R3-5 table guard).
      if (seq !== projectReqSeq.current) return
      if (res.success) { setProject(res.data); window.dispatchEvent(new CustomEvent('lambs-project-name', { detail: res.data.name })) }
    } catch (err) {
      if (seq !== projectReqSeq.current) return
      toast(err.message, 'error')
      navigate('/dashboard')
    }
  }

  const canManageRows = user?.role === 'super_admin' || user?.role === 'project_admin'
  const canAdmin = canManageRows

  const handleEditRow = (tab, row) => {
    const values = {}
    if (Array.isArray(row)) {
      tab.cols.forEach((col, ci) => { values[col] = row[ci] })
    } else {
      tab.cols.forEach(col => { values[col] = row[col] })
    }
    setEditingRow({ tabName: tab.name, pk: tab.pk, cols: tab.cols, values, isNew: false })
  }

  const handleInsertRow = () => {
    if (!tableData) return
    const values = {}
    tableData.cols.forEach(col => { values[col] = '' })
    setEditingRow({ tabName: tableData.name, pk: tableData.pk, cols: tableData.cols, values, isNew: true })
  }

  const saveRowEdit = async (e) => {
    e.preventDefault()
    if (!editingRow) return
    if (editingRow.isNew) {
      // Insert: send all non-empty values
      const payload = {}
      for (const [k, v] of Object.entries(editingRow.values)) {
        if (String(v ?? '').trim() !== '') payload[k] = v
      }
      try {
        await api.post(`/projects/${id}/data/row?table=${encodeURIComponent(editingRow.tabName)}${selectedDS ? `&ds=${selectedDS}` : ''}`, payload)
        toast('行已新增')
        setEditingRow(null)
        setSelectedPKs(new Set())
        fetchTableData(editingRow.tabName, 1, debouncedSearch, liveSort?.col, liveSort?.dir)
      } catch (err) { toast(err.message, 'error') }
      return
    }
    if (!editingRow.pk) { toast('该表无主键，无法编辑', 'error'); return }
    const pkVal = editingRow.values[editingRow.pk]
    if (pkVal === undefined || pkVal === null || pkVal === '') { toast('该行主键值为空，无法编辑', 'error'); return }
    const payload = { ...editingRow.values }
    delete payload[editingRow.pk]
    try {
      await api.put(`/projects/${id}/data/row?table=${encodeURIComponent(editingRow.tabName)}&pk=${encodeURIComponent(editingRow.pk)}&pkval=${encodeURIComponent(pkVal)}${selectedDS ? `&ds=${selectedDS}` : ''}`, payload)
      toast('行已更新')
      setEditingRow(null)
      setSelectedPKs(new Set())
      fetchTableData(editingRow.tabName, 1, debouncedSearch, liveSort?.col, liveSort?.dir)
    } catch (err) { toast(err.message, 'error') }
  }


  // Column resize for the live table (colIdx = data column index; cell index = colIdx+1 due to checkbox column)
  const liveResizeCol = (colIdx, e) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const row = e.target.closest('.tbl-row')
    const cells = row ? [...row.children] : []
    const cellIdx = colIdx + 1
    const startW = cells[cellIdx] ? cells[cellIdx].getBoundingClientRect().width : 100
    setLiveColWidths(prev => {
      if (!prev._locked) {
        const locked = { _locked: true }
        for (let i = 0; i < cells.length; i++) locked[i] = cells[i] ? cells[i].getBoundingClientRect().width : 80
        return locked
      }
      return prev
    })
    const onMove = (ev) => {
      const delta = ev.clientX - startX
      setLiveColWidths(prev => ({ ...prev, [colIdx]: Math.max(40, startW + delta) }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleBatchDelete = async () => {
    if (!tableData?.pk || selectedPKs.size === 0) return
    const ok = await confirm('批量删除', `确定删除表 ${tableData.name} 中选中的 ${selectedPKs.size} 行数据吗？此操作不可撤销。`)
    if (!ok) return
    try {
      let failed = 0
      for (const pkVal of selectedPKs) {
        try {
          await api.delete(`/projects/${id}/data/row?table=${encodeURIComponent(tableData.name)}&pk=${encodeURIComponent(tableData.pk)}&pkval=${encodeURIComponent(pkVal)}${selectedDS ? `&ds=${selectedDS}` : ''}`)
        } catch { failed++ }
      }
      toast(failed === 0 ? `已删除 ${selectedPKs.size} 行` : `删除完成，${failed} 行失败`)
      setSelectedPKs(new Set())
      const remaining = Math.max(0, (tableData.total || 0) - selectedPKs.size)
      const maxPage = Math.max(1, Math.ceil(remaining / PER_PAGE))
      const nextPage = Math.min(livePage, maxPage)
      setLivePage(nextPage)
      fetchTableData(tableData.name, nextPage, debouncedSearch, liveSort?.col, liveSort?.dir)
    } catch (err) { toast(err.message, 'error') }
  }

  useEffect(() => {
    setConnResult(null)
    setActiveTab(0)
    setAdminMode('data')
    setProcStats(null)
    fetchProject()
  }, [id])

  // Poll process resource stats every 5s
  useEffect(() => {
    const poll = () => {
      api.get(`/runtime/proc/status/${id}`).then(res => {
        if (res.success) setProcStats(res.data)
      }).catch(() => setProcStats(null))
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [id])

  // Fetch table list when project changes
  useEffect(() => {
    setSelectedTable('')
    setTableData(null)
    setSelectedPKs(new Set())
    setLivePage(1)
    api.get(`/projects/${id}/tables/list${selectedDS ? `?ds=${selectedDS}` : ''}`).then(res => {
      if (res.success) setTableList(res.data.tables || [])
    }).catch(() => setTableList([]))
  }, [id, selectedDS])

  // Fetch table data when selected table changes
  // R3-5: stale-response guard — a slow response for an earlier search must
  // not overwrite the result of a newer one.
  const tableReqSeq = useRef(0)
  const fetchTableData = useCallback((table, page = 1, search = '', sortCol = '', sortDir = '') => {
    const seq = ++tableReqSeq.current // bump even on the early return so in-flight responses die with the table
    if (!table) { setTableData(null); return }
    const q = new URLSearchParams({ table, page: String(page), page_size: String(PER_PAGE) })
    if (selectedDS) q.set('ds', selectedDS)
    if (search) q.set('search', search)
    if (sortCol) { q.set('sort_col', sortCol); q.set('sort_dir', sortDir || 'asc') }
    api.get(`/projects/${id}/tables?${q}`).then(res => {
      if (seq !== tableReqSeq.current) return // stale — a newer request is in flight
      if (res.success) {
        setTableData({ name: table, pk: res.data.pk, cols: res.data.columns, rows: res.data.rows, total: res.data.total || 0, page, pageSize: res.data.page_size || PER_PAGE })
      }
    }).catch(() => { if (seq === tableReqSeq.current) setTableData(null) })
  }, [id, selectedDS])

  // R3-5: debounce typing — every keystroke used to refetch (and clear the
  // selection + column widths); now the fetch fires 300ms after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(liveSearch), 300)
    return () => clearTimeout(t)
  }, [liveSearch])

  useEffect(() => {
    setLivePage(1)
    fetchTableData(selectedTable, 1, debouncedSearch, liveSort?.col, liveSort?.dir)
    setSelectedPKs(new Set())
    setLiveColWidths({})
  }, [selectedTable, debouncedSearch, fetchTableData])

  // Set browser favicon to project logo
  useEffect(() => {
    if (project?.icon_url && window.setLambsFavicon) {
      window.setLambsFavicon(project.icon_url)
    }
    return () => { if (window.setLambsFavicon) window.setLambsFavicon(localStorage.getItem('lambs_brand_logo_img')) }
  }, [project?.icon_url])

  if (!project) return <div className="empty-state"><div className="t">加载中…</div></div>

  // Type of the currently selected datasource (primary when none selected)
  const curDBType = ((project?.datasources || []).find(d => d.id === selectedDS)?.type || project?.db_type || '')

  const handleDelete = async () => {
    const ok = await confirm('删除项目', `确定删除「${project.name}」吗？所有数据将被移除。`)
    if (!ok) return
    try {
      await api.delete(`/projects/${id}`)
      toast(`项目「${project.name}」已删除`)
      window.dispatchEvent(new Event('lambs-projects-changed'))
      navigate('/dashboard')
    } catch (err) { toast(err.message, 'error') }
  }

  const testConnection = async () => {
    setTestingConn(true)
    try {
      const res = await api.post(`/projects/${id}/test-connection`)
      setConnResult(res.data)
      setTimeout(() => setConnResult(null), 5000)
    } catch (err) { toast(err.message, 'error') }
    finally { setTestingConn(false) }
  }

  const syncData = async () => {
    setSyncing(true)
    try {
      await api.post(`/projects/${id}/sync`)
      await fetchProject()
      setConnResult(null)
      toast('数据同步完成', 'success')
    } catch (err) { toast(err.message, 'error') }
    finally { setSyncing(false) }
  }

  const handleToggleStatus = async () => {
    const actionLabel = project.status === 'online' ? '停用项目' : project.status === 'maintenance' ? '上线项目' : '启用项目'
    const msg = project.status === 'online'
      ? `停用后「${project.name}」将对所有用户不可访问。${project.base_path ? '访问 '+project.base_path+' 将显示维护页面。' : ''}`
      : project.status === 'maintenance'
        ? `恢复上线后「${project.name}」将恢复对外访问。${project.base_path ? '用户可正常访问 '+project.base_path+'。' : ''}`
        : `启用后「${project.name}」将进入维护模式。${project.base_path ? '访问 '+project.base_path+' 将显示维护页面。' : ''}确认服务正常后再恢复上线。`
    const ok = await confirm(actionLabel, msg)
    if (!ok) return
    try {
      const res = await api.patch(`/projects/${id}/status`)
      setProject(prev => ({ ...prev, status: res.data.status }))
      window.dispatchEvent(new Event('lambs-projects-changed'))
      const s = res.data.status
      toast(s === 'online' ? '已启用' : s === 'maintenance' ? '维护中' : '已停用',
            s === 'online' ? 'success' : s === 'maintenance' ? 'info' : 'warn')
    } catch (err) { toast(err.message, 'error') }
  }

  const fetchLogs = async () => {
    setLoadingLogs(true)
    try {
      const res = await api.get(`/projects/${id}/logs`)
      setLogs(res.data?.logs || [])
      if (res.data?.error) toast(res.data.error, 'error')
    } catch (err) { toast(err.message, 'error') }
    finally { setLoadingLogs(false) }
  }

  const fetchBackups = async () => {
    try {
      const res = await api.get(`/backups/${id}`)
      if (res.success) setBackups(res.data.backups || [])
    } catch { /* */ }
  }

  const createBackup = async () => {
    setBackupLoading(true)
    try {
      const res = await api.post(`/backups/${id}`)
      if (res.success && res.data.ok) {
        toast(`备份完成 · ${res.data.size_mb}MB`, 'success')
        fetchBackups()
      } else {
        toast(res.data?.error || '备份失败', 'error')
      }
    } catch (err) { toast(err.message, 'error') }
    finally { setBackupLoading(false) }
  }

  const deleteBackup = async (filename) => {
    try {
      await api.delete(`/backups/${id}/download/${filename}`)
      toast('备份已删除')
      fetchBackups()
    } catch (err) { toast(err.message, 'error') }
  }

  const restoreBackup = async (filename) => {
    const ok = await confirm('恢复备份', `确定要用 ${filename} 恢复该项目数据库吗？当前数据将被覆盖。`)
    if (!ok) return
    try {
      await api.post(`/backups/${id}/restore/${filename}`)
      toast('数据库已恢复')
    } catch (err) { toast(err.message, 'error') }
  }

  const downloadBackup = async (filename) => {
    try {
      const token = localStorage.getItem('lambs_token') || sessionStorage.getItem('lambs_token')
      const base = import.meta.env.BASE_URL === '/' ? '/api' : import.meta.env.BASE_URL + 'api'
      const res = await fetch(`${base}/backups/${id}/download/${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast(body.error || `下载失败 (${res.status})`, 'error')
        return
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) { toast(err.message, 'error') }
  }

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/projects/${id}/members`)
      if (res.success) { setMembers(res.data.members); setNonMembers(res.data.non_members) }
    } catch {}
  }

  const addMember = async (userId) => {
    try {
      await api.post(`/projects/${id}/members`, { user_id: userId })
      fetchMembers()
      toast('成员已添加')
    } catch (err) { toast(err.message, 'error') }
  }

  const removeMember = async (userId) => {
    try {
      await api.delete(`/projects/${id}/members/${userId}`)
      fetchMembers()
      toast('成员已移除')
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      {/* Status banners */}
      {project.status === 'offline' && (
        <div style={{ background:'rgba(255,93,93,.12)', border:'1px solid var(--accent-red)', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
          <Icon name="xCircle" size={20} color="var(--accent-red)" />
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--accent-red)' }}>该项目已被管理员停用</div>
            <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>所有用户无法访问该项目。点击下方"启用"按钮恢复访问。</div>
          </div>
        </div>
      )}
      {project.status === 'maintenance' && (
        <div style={{ background:'rgba(255,161,59,.12)', border:'1px solid var(--accent-amber)', borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
          <Icon name="alert" size={20} color="var(--accent-amber)" />
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--accent-amber)' }}>该项目正在维护中</div>
            <div style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>维护期间用户暂时无法访问，请稍后重试。</div>
          </div>
        </div>
      )}

      {connResult && (
        <div style={{ background: connResult.reachable ? 'rgba(56,210,148,.1)' : 'rgba(255,93,93,.1)', border: `1px solid ${connResult.reachable ? 'var(--accent-green)' : 'var(--accent-red)'}`, borderRadius: 8, padding: '10px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{connResult.reachable ? '✅' : '❌'}</span>
          <span>{connResult.reachable ? `连接成功 · ${connResult.latency_ms}ms · ${connResult.db_type}` : `连接失败 · ${connResult.error}`}</span>
        </div>
      )}

      {(() => {
        const hasProcess = !!(project?.service_name || project?.startup_command)
        const statusLabel = { online: '在线', offline: '已离线', maintenance: '维护中' }[project?.status] || project?.status
        const statusColor = project?.status === 'online' ? 'var(--accent-green)' : project?.status === 'maintenance' ? 'var(--accent-amber)' : 'var(--text-tertiary)'
        const barStyle = { background: 'var(--bg-panel-raised)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }
        if (hasProcess) {
          if (procStats?.running) {
            return (
              <div style={barStyle}>
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>● 进程运行中</span>
                <span>CPU <b style={{ color: 'var(--text-primary)' }}>{procStats.cpu_percent?.toFixed(1)}%</b></span>
                <span>内存 <b style={{ color: 'var(--text-primary)' }}>{procStats.rss_mb} MB</b></span>
                <span>运行时长 <b style={{ color: 'var(--text-primary)' }}>{Math.floor(procStats.uptime_sec / 3600)}小时{Math.floor((procStats.uptime_sec % 3600) / 60)}分</b></span>
                <span>PID <b style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{procStats.pid}</b></span>
              </div>
            )
          }
          return (
            <div style={barStyle}>
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>● 进程未运行</span>
              <span>状态 <b style={{ color: statusColor }}>{statusLabel}</b></span>
              <span>配置了 {project.startup_command ? '启动命令' : 'systemd 服务'}，上线后由 Lambs 拉起</span>
            </div>
          )
        }
        // Pure datasource project: no managed process — show its real config state.
        const dsCount = (project.datasources || []).length
        return (
          <div style={barStyle}>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>● 数据源模式</span>
            <span>类型 <b style={{ color: 'var(--text-primary)' }}>{project.db_type || '未配置'}</b></span>
            {user?.role === 'super_admin' && dsCount > 0 && <span>数据源 <b style={{ color: 'var(--text-primary)' }}>{dsCount} 个</b></span>}
            <span>状态 <b style={{ color: statusColor }}>{statusLabel}</b></span>
            <span>无进程管理 — 直接连接浏览数据</span>
          </div>
        )
      })()}

      {/* Stats */}
      <div className="summary-row">
        {(project.features || []).map((f, i) => (
          <div className="stat-card" key={i}>
            <div className="k">{f.label}</div>
            <div className="v">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>
            <button className="btn btn-ghost btn-sm" aria-label="返回仪表盘" style={{ marginRight: 8 }} onClick={() => navigate('/dashboard')}><Icon name="arrowLeft" size={14} /></button>
            {project.name} · 详情
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canAdmin && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={testConnection} disabled={testingConn}>
                  {testingConn ? '检测中…' : '测试连接'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={syncData} disabled={syncing || project.status !== 'online'}>
                  {syncing ? '同步中…' : '同步数据'}
                </button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => openDrawer(`编辑项目·${project.name}`, <ProjectForm project={project} onDone={(s) => { closeDrawer(); fetchProject(); window.dispatchEvent(new Event('lambs-projects-changed')); syncLambsBrand(s) }} />)}>
                  编辑
                </button>
                <button className={`btn ${project.status === 'online' ? 'btn-ghost' : 'btn-ghost'} btn-sm`}
                  onClick={handleToggleStatus}>
                  {project.status === 'online' ? '停用' : project.status === 'maintenance' ? '上线' : '启用'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>删除</button>
              </>
            )}
          </div>
        </div>

        {/* Admin tabs */}
        <div className="tabs" style={{ marginBottom: 12 }}>
          <div className={`tab-item ${adminMode === 'data' ? 'active' : ''}`} onClick={() => setAdminMode('data')}>数据浏览</div>
          {canAdmin && (
            <div className={`tab-item ${adminMode === 'members' ? 'active' : ''}`} onClick={() => { setAdminMode('members'); fetchMembers() }}>成员管理</div>
          )}
          {project?.service_name && (
            <div className={`tab-item ${adminMode === 'logs' ? 'active' : ''}`} onClick={() => { setAdminMode('logs'); fetchLogs() }}>服务日志</div>
          )}
          <div className={`tab-item ${adminMode === 'backups' ? 'active' : ''}`} onClick={() => { setAdminMode('backups'); fetchBackups() }}>备份管理</div>
        </div>

        {adminMode === 'logs' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{project.service_name}.service · 最近 {logs.length} 条</span>
              <button className="btn btn-ghost btn-sm" onClick={fetchLogs} disabled={loadingLogs}>{loadingLogs ? '加载中…' : '刷新日志'}</button>
            </div>
            <div style={{ background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, maxHeight: 400, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.6, color: 'var(--code-punct)' }}>
              {logs.length === 0 ? (
                <span style={{ color: 'var(--text-tertiary)' }}>— 暂无日志 —</span>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    <span style={{ color: l.includes('ERROR') || l.includes('error') ? 'var(--accent-red)' : l.includes('WARN') ? 'var(--accent-amber)' : 'inherit' }}>{l}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {adminMode === 'backups' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                数据库备份 {backups.length > 0 && <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:400}}>（{backups.length}个）</span>}
              </span>
              {project.dsn && project.dsn !== '—' ? (
                <button className="btn btn-primary btn-sm" onClick={createBackup} disabled={backupLoading}>
                  {backupLoading ? '备份中…' : '+ 创建备份'}
                </button>
              ) : (
                <span style={{fontSize:11,color:'var(--text-tertiary)'}}>该项目无独立数据库</span>
              )}
            </div>
            {backups.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                暂无备份，点击上方按钮创建
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {backups.map(b => (
                  <div key={b.filename} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(var(--glass-bg),.5)', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{b.filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{b.created} · {b.size_mb}MB</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => downloadBackup(b.filename)}>下载</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => restoreBackup(b.filename)}>恢复</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--accent-red)' }} onClick={() => deleteBackup(b.filename)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {adminMode === 'members' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>已分配成员 ({members.length})</div>
            {members.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>暂无成员</div>
            ) : (
              members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(var(--glass-bg),.5)', borderRadius: 7, marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{m.email}</span>
                    <span className={`chip ${m.role === 'super_admin' ? 'chip-sa' : m.role === 'project_admin' ? 'chip-pa' : 'chip-vi'}`} style={{ marginLeft: 8, fontSize: 10 }}>
                      {m.role === 'super_admin' ? '超管' : m.role === 'project_admin' ? '管理员' : '查看者'}
                    </span>
                  </div>
                  {m.role !== 'super_admin' && (
                    <span style={{ fontSize: 11, color: 'var(--accent-red)', cursor: 'pointer' }} onClick={() => removeMember(m.id)}>移除</span>
                  )}
                </div>
              ))
            )}

            {nonMembers.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 18, marginBottom: 10, color: 'var(--text-primary)' }}>可添加用户</div>
                {nonMembers.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(var(--glass-bg),.3)', borderRadius: 7, marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 12 }}>{u.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{u.email}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--accent-cyan)', cursor: 'pointer' }} onClick={() => addMember(u.id)}>+ 添加</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Datasource switcher — only for multi-datasource projects */}
        {adminMode === 'data' && (project?.datasources || []).length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>数据源</span>
            <TypeSelect value={selectedDS} onChange={setSelectedDS}
              style={{ minWidth: 210 }}
              options={[
                { value: '', label: '主数据源（默认）' },
                ...(project?.datasources || []).map(d => ({ value: d.id, label: `${d.name} · ${d.type}${d.is_primary ? ' · 主' : ''}` })),
              ]} />
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={async () => {
                try {
                  const res = await api.post(`/projects/${id}/test-connection${selectedDS ? `?ds=${selectedDS}` : ''}`)
                  if (res.success && res.data?.reachable) toast(`连接成功（${res.data.db_type || '数据源'}）`, 'success')
                  else if (res.success) toast(`连接失败: ${res.data?.error || '不可达'}`, 'error')
                } catch (err) { toast(err.message, 'error') }
              }}>
              测试连接
            </button>
          </div>
        )}

        {/* Tabs */}
        {adminMode === 'data' && (curDBType.includes('MongoDB') ? (
          <DocView id={id} tableList={tableList} selectedTable={selectedTable} onSelectTable={setSelectedTable} canManageRows={canManageRows} toast={toast} ds={selectedDS} />
        ) : curDBType.includes('Redis') ? (
          <KVView id={id} tableList={tableList} selectedTable={selectedTable} onSelectTable={setSelectedTable} canManageRows={canManageRows} toast={toast} ds={selectedDS} />
        ) : curDBType.includes('向量') || curDBType.toLowerCase().includes('qdrant') ? (
          <VectorView id={id} tableList={tableList} selectedTable={selectedTable} onSelectTable={setSelectedTable} canManageRows={canManageRows} toast={toast} ds={selectedDS} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Toolbar: table selector + search + actions */}
            <div className="toolbar">
              <div className="toolbar-left">
                <TypeSelect value={selectedTable} onChange={setSelectedTable}
                  style={{ minWidth: 190 }}
                  options={[{ value: '', label: '选择数据表…' }, ...tableList]} />
                {tableData && (
                  <input placeholder={`搜索 ${tableData.name}…`} value={liveSearch}
                    onChange={e => { setLiveSearch(e.target.value); setLivePage(1) }}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 12px', color: 'var(--text-primary)', fontSize: 12, minWidth: 180 }} />
                )}
              </div>
              <div className="toolbar-right" style={{ display: 'flex', gap: 8 }}>
                {tableData && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      const csv = [tableData.cols.join(','), ...tableData.rows.map(r => tableData.cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
                      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${project.id}_${tableData.name}.csv`; a.click()
                    }}>导出CSV</button>
                    {canManageRows && (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={handleInsertRow}>+ 新增行</button>
                        <button className="btn btn-ghost btn-sm" disabled={selectedPKs.size !== 1}
                          onClick={() => {
                            const pkVal = Array.from(selectedPKs)[0]
                            const row = tableData.rows.find(r => String(r[tableData.pk]) === String(pkVal))
                            if (row) handleEditRow(tableData, row)
                          }}>编辑</button>
                        <button className="btn btn-danger btn-sm" disabled={selectedPKs.size === 0}
                          onClick={handleBatchDelete}>删除{selectedPKs.size > 0 ? ` (${selectedPKs.size})` : ''}</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Table */}
            {tableData && (() => {
              const cols = tableData.cols
              const rows = tableData.rows // server-side search/sort/pagination
              const totalPages = Math.max(1, Math.ceil((tableData.total || rows.length) / PER_PAGE))
              const paged = rows
              const gridStyle = liveColWidths._locked
                ? { gridTemplateColumns: `44px ${cols.map((_, i) => i === cols.length - 1 ? '1fr' : (liveColWidths[i] || 80) + 'px').join(' ')}` }
                : { gridTemplateColumns: `44px repeat(${cols.length}, minmax(90px, 1fr))` }
              const allChecked = paged.length > 0 && paged.every(r => selectedPKs.has(String(r[tableData.pk])))
              const toggleAll = () => {
                const next = new Set(selectedPKs)
                if (allChecked) { paged.forEach(r => next.delete(String(r[tableData.pk]))) }
                else { paged.forEach(r => next.add(String(r[tableData.pk]))) }
                setSelectedPKs(next)
              }
              const toggleOne = (pkVal) => {
                const next = new Set(selectedPKs)
                if (next.has(pkVal)) next.delete(pkVal); else next.add(pkVal)
                setSelectedPKs(next)
              }

              const getPages = () => {
                const pages = [1]
                const start = Math.max(2, livePage - 2), end = Math.min(totalPages - 1, livePage + 2)
                if (start > 2) pages.push('...')
                for (let p = start; p <= end; p++) pages.push(p)
                if (end < totalPages - 1) pages.push('...')
                if (totalPages > 1) pages.push(totalPages)
                return pages
              }

              return (
                <>
                  <div className="tbl">
                    <div className="tbl-row head" style={gridStyle}>
                      <span>
                        {canManageRows && tableData.pk && (
                          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                        )}
                      </span>
                      {cols.map((col, ci) => {
                        const applySort = () => {
                          // Sort refetches inline and keeps the row selection:
                          // sorting only reorders the same rows, so clearing
                          // selectedPKs on the third click (desc→none) was a
                          // silent selection loss (R3-P3).
                          const next = liveSort?.col === col
                            ? (liveSort.dir === 'asc' ? { col, dir: 'desc' } : null)
                            : { col, dir: 'asc' }
                          setLiveSort(next)
                          setLivePage(1)
                          // Jumping back to page 1 hides rows selected on
                          // later pages — keep the checkbox count honest (R5 F1).
                          if (livePage !== 1) setSelectedPKs(new Set())
                          fetchTableData(selectedTable, 1, debouncedSearch, next?.col, next?.dir)
                        }
                        return (
                          <span key={ci} role="button" tabIndex={0}
                            onClick={applySort}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applySort() } }}
                            style={{ cursor: 'pointer', position: 'relative', paddingRight: ci < cols.length - 1 ? 10 : 0 }}>
                            {col}{liveSort?.col === col ? (liveSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                            {ci < cols.length - 1 && <span className="col-resize" onMouseDown={e => liveResizeCol(ci, e)} />}
                          </span>
                        )
                      })}
                    </div>
                    {paged.length === 0 ? (
                      <div className="empty-state"><div className="t">无匹配数据</div></div>
                    ) : (
                      paged.map((row, ri) => {
                        const pkVal = tableData.pk ? String(row[tableData.pk]) : null
                        return (
                          <div key={ri} className="tbl-row" style={gridStyle}>
                            <span style={{ paddingLeft: 10 }}>
                              {canManageRows && pkVal !== null && (
                                <input type="checkbox" checked={selectedPKs.has(pkVal)} onChange={() => toggleOne(pkVal)} style={{ cursor: 'pointer' }} />
                              )}
                            </span>
                            {cols.map((col, ci) => (
                              <span key={ci} style={col === tableData.pk ? { fontWeight: 600, color: 'var(--accent-cyan)' } : undefined}>
                                {fmtTime(row[col])}
                              </span>
                            ))}
                          </div>
                        )
                      })
                    )}
                  </div>

                  {totalPages > 1 && (
                    <div className="pagination">
                      <span className="pg-info" style={{ marginRight: 6 }}>共 {tableData.total} 行</span>
                      <button className="pg-btn" disabled={livePage === 1} onClick={() => { const p = livePage - 1; setLivePage(p); setSelectedPKs(new Set()); fetchTableData(tableData.name, p, debouncedSearch, liveSort?.col, liveSort?.dir) }}>‹</button>
                      {getPages().map((p, i) => (
                        p === '...'
                          ? <span key={i} className="pg-info">…</span>
                          : <button key={i} className={`pg-btn ${p === livePage ? 'active' : ''}`}
                              onClick={() => { setLivePage(p); setSelectedPKs(new Set()); fetchTableData(tableData.name, p, debouncedSearch, liveSort?.col, liveSort?.dir) }}>{p}</button>
                      ))}
                      <button className="pg-btn" disabled={livePage === totalPages} onClick={() => { const p = livePage + 1; setLivePage(p); setSelectedPKs(new Set()); fetchTableData(tableData.name, p, debouncedSearch, liveSort?.col, liveSort?.dir) }}>›</button>
                      <span className="pg-info">{livePage}/{totalPages}</span>
                    </div>
                  )}
                </>
              )
            })()}

            {!tableData && (
              <div className="empty-state"><div className="t">从上方下拉选择数据表开始浏览</div></div>
            )}
          </div>
        ))}
      </div>

      {/* Row Edit / Insert Modal */}
      {editingRow && (
        <div className="modal-overlay open" onClick={() => setEditingRow(null)}>
          <form className="modal-box" style={{ maxWidth: 420, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()} onSubmit={saveRowEdit}>
            <div className="modal-title">{editingRow.isNew ? '新增行' : '编辑行'} · {editingRow.tabName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {editingRow.cols.map(col => (
                col === editingRow.pk && !editingRow.isNew ? (
                  <div key={col} className="field">
                    <label>{col}</label>
                    <input value={String(editingRow.values[col] ?? '')} disabled style={{ opacity: 0.5 }} />
                  </div>
                ) : (
                  <div key={col} className="field">
                    <label>{col}{editingRow.isNew && col === editingRow.pk && (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>（自增可留空）</span>
                    )}</label>
                    <input value={String(editingRow.values[col] ?? '')} placeholder={editingRow.isNew ? '留空则不填' : ''}
                      onChange={e => setEditingRow(prev => ({ ...prev, values: { ...prev.values, [col]: e.target.value } }))} />
                  </div>
                )
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingRow(null)}>取消</button>
              <button className="btn btn-primary btn-sm">{editingRow.isNew ? '新增' : '保存'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
