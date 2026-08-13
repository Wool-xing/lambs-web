import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../components/Modal'
import { useToast } from '../components/Toast'
import { api } from '../api/client'
import Icon from './Icon'

const MAX_VISIBLE = 8

export default function Sidebar() {
  const { user, logout } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [projects, setProjects] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [cfmPwd, setCfmPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  const doChangePwd = async (e) => {
    e.preventDefault()
    if (!oldPwd || !newPwd) { toast('请填写完整', 'error'); return }
    if (newPwd.length < 6) { toast('新密码至少6位', 'error'); return }
    if (newPwd !== cfmPwd) { toast('两次密码不一致', 'error'); return }
    setPwdLoading(true)
    try {
      await api.put('/auth/me/password', { old: oldPwd, new: newPwd })
      toast('密码已修改')
      setShowPwd(false); setOldPwd(''); setNewPwd(''); setCfmPwd('')
    } catch (err) { toast(err.message, 'error') }
    finally { setPwdLoading(false) }
  }

  const fetchProjects = () => {
    api.get('/projects?sort_by=order').then(res => {
      if (res.success) setProjects(res.data.projects || [])
    }).catch(() => {})
  }

  useEffect(() => {
    fetchProjects()
    const handler = () => fetchProjects()
    window.addEventListener('lambs-projects-changed', handler)
    return () => window.removeEventListener('lambs-projects-changed', handler)
  }, [])

  const [logoImg, setLogoImg] = useState(localStorage.getItem('lambs_brand_logo_img') || '')
  const isActive = (path) => location.pathname === path

  useEffect(() => {
    const h = () => setLogoImg(localStorage.getItem('lambs_brand_logo_img') || '')
    window.addEventListener('lambs-logo-changed', h)
    return () => window.removeEventListener('lambs-logo-changed', h)
  }, [])
  const doLogout = async () => {
    const ok = await confirm('退出登录', '确定要退出登录吗？')
    if (ok) logout()
  }

  const visible = expanded || projects.length <= MAX_VISIBLE ? projects : projects.slice(0, MAX_VISIBLE)
  const hidden = projects.length > MAX_VISIBLE && !expanded ? projects.slice(MAX_VISIBLE) : []

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-mark">{logoImg ? <img src={logoImg} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : 'L'}</div>
        <div className="sidebar-name">Lambs管理系统</div>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-group">总览</div>
        <div className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>
          <Icon name="dashboard" size={16} /> 仪表盘
        </div>

        <div className="nav-group">项目</div>
        {visible.map(p => (
          <div key={p.id} className={`nav-item ${location.pathname === `/project/${p.id}` ? 'active' : ''}`}
            onClick={() => navigate(`/project/${p.id}`)}>
            <span className={`nav-dot ${p.status === 'online' ? 'online' : p.status === 'maintenance' ? 'warn' : 'off'}`} />
            {p.name}
            {p.is_pinned && <span style={{ marginLeft: 'auto', opacity: .4 }}><Icon name="star" size={10} /></span>}
          </div>
        ))}
        {hidden.length > 0 && (
          <div className="nav-item" style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}
            onClick={() => setExpanded(true)}>
            展开全部 ({hidden.length}个)
          </div>
        )}
        {expanded && projects.length > MAX_VISIBLE && (
          <div className="nav-item" style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}
            onClick={() => setExpanded(false)}>
            收起
          </div>
        )}

        <div className="nav-group">管理</div>
        {user?.role === 'super_admin' && (
          <div className={`nav-item ${isActive('/users') ? 'active' : ''}`} onClick={() => navigate('/users')}>
            <Icon name="users" size={16} /> 用户管理
          </div>
        )}
        <div className={`nav-item ${isActive('/notifications') ? 'active' : ''}`} onClick={() => navigate('/notifications')}>
          <Icon name="bell" size={16} /> 通知中心
        </div>
        {user?.role === 'super_admin' && (
          <div className={`nav-item ${isActive('/settings') ? 'active' : ''}`} onClick={() => navigate('/settings')}>
            <Icon name="settings" size={16} /> 系统设置
          </div>
        )}
      </nav>
      <div className="sidebar-footer">
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
          ) : (
            <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg, #6366f1, #8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:15,fontWeight:700,color:'#fff',textTransform:'uppercase'}}>
              {(user?.name || user?.username || '?')[0]}
            </div>
          )}
          <div style={{overflow:'hidden'}}>
            <div style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
            <div style={{fontSize:10,color:'var(--text-tertiary)',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>{user?.email}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:12}}>
          <span style={{fontSize:10,color:'var(--text-tertiary)',cursor:'pointer'}} onClick={() => setShowPwd(true)}>修改密码</span>
          <span style={{fontSize:10,color:'var(--text-tertiary)',cursor:'pointer'}} onClick={doLogout}>退出登录</span>
        </div>
      </div>
      {showPwd && (
        <div className="modal-overlay open" onClick={() => setShowPwd(false)}>
          <form className="modal-box" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()} onSubmit={doChangePwd}>
            <div className="modal-title">修改密码</div>
            <div className="field"><label>原密码</label><input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="输入原密码" autoFocus /></div>
            <div className="field"><label>新密码</label><input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="至少6位新密码" /></div>
            <div className="field"><label>确认密码</label><input type="password" value={cfmPwd} onChange={e => setCfmPwd(e.target.value)} placeholder="再次输入新密码" /></div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPwd(false)}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={pwdLoading}>{pwdLoading ? '修改中…' : '确认修改'}</button>
            </div>
          </form>
        </div>
      )}
    </aside>
  )
}
