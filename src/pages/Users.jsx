import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Modal'
import { fmtTime } from '../utils/time'
import { useDrawer } from '../components/Drawer'
import { useDebounce } from '../hooks/useDebounce'
import UserForm from '../components/UserForm'
import TypeSelect from '../components/TypeSelect'
import { useNavigate } from 'react-router-dom'

export default function Users() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { openDrawer, closeDrawer } = useDrawer()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [counts, setCounts] = useState({})
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetNewPwd, setResetNewPwd] = useState('')
  const PAGE_SIZE = 20
  const debouncedSearch = useDebounce(search)

  useEffect(() => {
    if (user && user.role !== 'super_admin') { navigate('/dashboard') }
  }, [user])

  const usersReqSeq = useRef(0)
  const fetchUsers = useCallback(async (pg) => {
    const seq = ++usersReqSeq.current
    try {
      const q = new URLSearchParams({ search: debouncedSearch, role: roleFilter, page: String(pg||1), page_size: String(PAGE_SIZE) })
      const res = await api.get(`/users?${q}`)
      // Stale-page guard: an old response must not splice into a newer
      // list after a filter/search reset (R12).
      if (seq !== usersReqSeq.current) return
      if (res.success) {
        if (pg && pg > 1) setUsers(prev => [...prev, ...res.data.users])
        else setUsers(res.data.users)
        setCounts(res.data.counts || {})
        setHasMore(res.data.users.length === PAGE_SIZE)
        setLoadError(false)
      } else setLoadError(true)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [debouncedSearch, roleFilter])

  useEffect(() => { setPage(1); fetchUsers(1) }, [fetchUsers])

  const loadMore = () => { const np = page + 1; setPage(np); fetchUsers(np) }

  const handleDelete = async (u) => {
    const ok = await confirm('删除用户', `确定删除「${u.name}」吗？`)
    if (!ok) return
    try { await api.delete(`/users/${u.id}`); toast('已删除'); setPage(1); fetchUsers(1) }
    catch (err) { toast(err.message, 'error') }
  }

  const handleResetPwd = (u) => { setResetTarget(u); setResetNewPwd('') }
  const doResetPwd = async () => {
    if (!resetTarget || resetNewPwd.length < 6) { toast('新密码至少6位', 'error'); return }
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { new_password: resetNewPwd })
      toast(`${resetTarget.name} 密码已重置`)
      setResetTarget(null)
    } catch (err) { toast(err.message, 'error') }
  }

  const roleChip = (role) => {
    if (role === 'super_admin') return 'chip-sa'
    if (role === 'project_admin') return 'chip-pa'
    return 'chip-vi'
  }
  const roleLabel = (role) => {
    if (role === 'super_admin') return '超级管理员'
    if (role === 'project_admin') return '项目管理员'
    return '查看者'
  }

  if (loading) return <div className="empty-state"><div className="t">加载中…</div></div>
  if (loadError) return (
    <div className="empty-state">
      <div className="t">用户加载失败</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>网络异常或服务不可用</div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { setLoading(true); fetchUsers(1) }}>重试</button>
    </div>
  )

  return (
    <>
    <div className="card">
      <div className="card-header">
        <div className="card-title">用户管理</div>
        <button className="btn btn-primary btn-sm"
          onClick={() => openDrawer('新增用户', <UserForm onDone={() => { closeDrawer(); fetchUsers() }} />)}>
          + 新增用户
        </button>
      </div>

      {/* Mobile role select — custom rounded dropdown (native popup can't be styled) */}
      <div className="role-nav-mobile" style={{ marginBottom: 10 }}>
        <TypeSelect
          value={{ all: '全部用户', super_admin: '超级管理员', project_admin: '项目管理员', viewer: '查看者' }[roleFilter]}
          onChange={v => setRoleFilter({ '全部用户': 'all', '超级管理员': 'super_admin', '项目管理员': 'project_admin', '查看者': 'viewer' }[v])}
          options={['全部用户', '超级管理员', '项目管理员', '查看者']}
        />
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Role nav desktop */}
        <div className="role-nav" style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 16 }}>
          {[{ key: 'all', label: '全部', color: 'transparent' },
            { key: 'super_admin', label: '超级管理员', color: 'var(--accent-purple)' },
            { key: 'project_admin', label: '项目管理员', color: 'var(--accent-cyan)' },
            { key: 'viewer', label: '查看者', color: 'var(--accent-amber)' },
          ].map(r => (
            <div key={r.key}
              className={`role-nav-item ${roleFilter === r.key ? 'active' : ''}`}
              style={roleFilter === r.key ? { borderLeftColor: r.color } : {}}
              onClick={() => setRoleFilter(r.key)}>
              {r.label} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>{counts[r.key] || 0}</span>
            </div>
          ))}
        </div>

        {/* User table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input placeholder="搜索姓名或邮箱…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, maxWidth: 260 }} />

          <div className="tbl">
            <div className="tbl-row head" style={{ gridTemplateColumns: '.9fr 1.1fr .8fr .7fr .7fr 1fr' }}>
              <span>姓名</span><span>邮箱</span><span>角色</span><span>状态</span><span>最近登录</span><span>操作</span>
            </div>
            {users.length === 0 ? (
              <div className="empty-state"><div className="t">未找到匹配的用户</div></div>
            ) : users.map(u => (
              <div key={u.id} className="tbl-row" style={{ gridTemplateColumns: '.9fr 1.1fr .8fr .7fr .7fr 1fr' }}>
                <span style={{ fontWeight: 500 }}>{u.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.email}</span>
                <span className={`chip ${roleChip(u.role)}`} style={{ textAlign: 'center' }}>{roleLabel(u.role)}</span>
                <span className={`chip ${u.status === 'active' ? 'chip-online' : 'chip-offline'}`}>{u.status === 'active' ? '正常' : '禁用'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtTime(u.last_login)}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <span className="link-action" onClick={() => openDrawer(`编辑用户·${u.name}`, <UserForm userData={u} onDone={() => { closeDrawer(); fetchUsers(1) }} />)}>编辑</span>
                  <span className="link-action" onClick={() => handleResetPwd(u)}>重置密码</span>
                  <span className="link-action danger" onClick={() => handleDelete(u)}>删除</span>
                </span>
              </div>
            ))}
          </div>
          {hasMore && users.length >= PAGE_SIZE && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={loadMore}>加载更多</button>
            </div>
          )}
        </div>
      </div>
    </div>
    {resetTarget && (
      <div className="modal-overlay open" onClick={() => setResetTarget(null)}>
        <form className="modal-box" style={{maxWidth:380}} onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); doResetPwd() }}>
          <div className="modal-title">重置密码 · {resetTarget.name}</div>
          <div className="field"><label>新密码</label><input type="password" value={resetNewPwd} onChange={e=>setResetNewPwd(e.target.value)} placeholder="至少6位" autoFocus /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setResetTarget(null)}>取消</button>
            <button className="btn btn-primary btn-sm">确认重置</button>
          </div>
        </form>
      </div>
    )}
    </>
  )
}
