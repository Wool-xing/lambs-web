import { useState, useEffect } from 'react'
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
  const [unread, setUnread] = useState(0)
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
    api.get('/notifications?type=all').then(res => {
      if (res.success) setUnread(res.data.unread_count || 0)
    }).catch(() => {})
  }

  useEffect(() => {
    fetchUnread()
    const t = setInterval(fetchUnread, 30000)
    window.addEventListener('lambs-notifs-changed', fetchUnread)
    return () => {
      clearInterval(t)
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
          <span onClick={() => navigate('/dashboard')}>{info.bc}</span>
        </div>
      </div>
      <div className="topbar-right">
        <button className="topbar-btn" title="通知中心" onClick={() => navigate('/notifications')} style={{ position: 'relative' }}>
          <Icon name="bell" size={16} />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <div className="topbar-clock">{time}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ps-dot green" />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>系统正常</span>
        </div>
        <button className="topbar-btn" title="退出登录" onClick={() => logout()} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="logout" size={14} />
          <span style={{ fontSize: 11 }}>退出</span>
        </button>
      </div>
    </header>
  )
}
