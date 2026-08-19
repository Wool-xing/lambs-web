import { useState, useEffect } from 'react'
import { useConfirm } from './Modal'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => {
      const n = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      setTime(`${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}`)
    }
    update()
    const i = setInterval(update, 10000)
    return () => clearInterval(i)
  }, [])
  return time
}

const TITLES = {
  '/dashboard': { title: '仪表盘', bc: 'Lambs管理系统 / 仪表盘' },
  '/users': { title: '用户管理', bc: 'Lambs管理系统 / 用户管理' },
  '/notifications': { title: '通知中心', bc: 'Lambs管理系统 / 通知中心' },
  '/settings': { title: '系统设置', bc: 'Lambs管理系统 / 系统设置' },
}

export default function Topbar() {
  const time = useClock()
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const confirm = useConfirm()
  const [unread, setUnread] = useState(0)
  const [sysOk, setSysOk] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    const match = location.pathname.match(/^\/project\/(.+)/)
    if (match) {
      const onName = (e) => setProjectName(e.detail)
      window.addEventListener('lambs-project-name', onName)
      return () => window.removeEventListener('lambs-project-name', onName)
    } else {
      setProjectName('')
    }
  }, [location.pathname])

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
    document.body.classList.toggle('sidebar-open', !sidebarOpen)
  }

  const fetchUnread = () => {
    api.get('/notifications?type=all&page_size=1').then(res => {
      if (res.success) setUnread(res.data.unread_count || 0)
    }).catch(() => {})
  }

  // 健康点由 /system/health 驱动 — API 宕机时必须变灰，
  // 写死的绿灯会在后端挂了时继续"系统正常" (R18)。
  const fetchHealth = () => {
    api.get('/system/health').then(res => {
      setSysOk(!!(res && res.success))
    }).catch(() => setSysOk(false))
  }

  useEffect(() => {
    fetchUnread()
    fetchHealth()
    const t = setInterval(fetchUnread, 30000)
    const h = setInterval(fetchHealth, 30000)
    window.addEventListener('lambs-notifs-changed', fetchUnread)
    return () => {
      clearInterval(t)
      clearInterval(h)
      window.removeEventListener('lambs-notifs-changed', fetchUnread)
    }
  }, [location.pathname])

  // Check if on project detail page
  const isProject = location.pathname.startsWith('/project/')
  const info = TITLES[location.pathname] || (isProject ? { title: projectName || '项目详情', bc: `Lambs管理系统 / 项目 / ${projectName || ''}` } : { title: '', bc: '' })

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={toggleSidebar} aria-label="菜单"><Icon name="menu" size={16} /></button>
        <div className="topbar-title">{info.title}</div>
        <div className="topbar-bc">
          <span role="button" tabIndex={0} aria-label="返回仪表盘"
            onClick={() => navigate('/dashboard')}
            onKeyDown={e => { if (e.key === 'Enter') navigate('/dashboard') }}>{info.bc}</span>
        </div>
      </div>
      <div className="topbar-right">
        <button className="topbar-btn" title="通知中心" onClick={() => navigate('/notifications')} style={{ position: 'relative' }}>
          <Icon name="bell" size={16} />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <div className="topbar-clock">{time}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`ps-dot ${sysOk ? 'green' : 'gray'}`} />
          <span className="topbar-health-text" style={{ fontSize: 11, color: sysOk ? 'var(--text-tertiary)' : 'var(--accent-red)' }}>{sysOk ? '系统正常' : '系统失联'}</span>
        </div>
        <button className="topbar-btn" title="退出登录" onClick={async () => { const ok = await confirm('退出登录', '确定退出当前账号吗？'); if (ok) logout() }} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="logout" size={14} />
          <span style={{ fontSize: 11 }}>退出</span>
        </button>
      </div>
    </header>
  )
}
