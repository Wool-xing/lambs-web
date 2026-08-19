import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { resolveAsset } from './api/client'
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Users = lazy(() => import('./pages/Users'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Settings = lazy(() => import('./pages/Settings'))
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ErrorBoundary from './components/ErrorBoundary'
import { applyTheme } from './components/ThemePicker'

// v2.6 — global favicon setter (available on login page too)
const DEFAULT_FAV = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAUklEQVR4nO3XIQ4AIAxD0d3/UFiOBQ5DEzBbJ36T6T65RqjMsVLumaziL0hVuURUl18IK8BVfhAAAAAAAAAAAAAAANgB9re8BcA+zVqM0wqIyAZqzpfIgTCdawAAAABJRU5ErkJggg=="
window.setLambsFavicon = (url) => {
  url = resolveAsset(url)
  let fav = document.getElementById('lambs-favicon')
  if (!fav) { fav = document.querySelector('link[rel="icon"]') }
  if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; fav.id = 'lambs-favicon'; document.head.appendChild(fav) }
  if (!url) { fav.href = DEFAULT_FAV; return }
  // Resize to 32x32 PNG — browsers reject huge data URLs as favicon
  const img = new Image()
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32
      c.getContext('2d').drawImage(img, 0, 0, 32, 32)
      fav.href = c.toDataURL('image/png')
    } catch { fav.href = DEFAULT_FAV } // tainted canvas (cross-origin icon)
  }
  img.onerror = () => { fav.href = DEFAULT_FAV }
  img.src = url
}
const setFavicon = (url) => window.setLambsFavicon(url)

function AppInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showHelp, setShowHelp] = useState(false)

  // Apply saved theme and favicon on mount
  useEffect(() => {
    applyTheme(localStorage.getItem('lambs_theme') || 'dark-default')
    setFavicon(localStorage.getItem('lambs_brand_logo_img'))
    const onLogo = () => setFavicon(localStorage.getItem('lambs_brand_logo_img'))
    window.addEventListener('lambs-logo-changed', onLogo)
    return () => window.removeEventListener('lambs-logo-changed', onLogo)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      // Enter/Space triggers click on interactive elements
      if ((e.key === 'Enter' || e.key === ' ') && !(e.ctrlKey || e.metaKey || e.altKey)) {
        const el = e.target.closest('.nav-item,.tab-item,.f-chip,.role-nav-item,.theme-card,.project-card,.dd-item')
        if (el) { e.preventDefault(); el.click(); return }
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      // ? or Alt+/ toggles help panel
      if (e.key === '?' || (e.altKey && e.code === 'Slash')) { e.preventDefault(); setShowHelp(v => !v); return }
      // Esc or Alt+Esc closes drawer/modal/dropdown/help
      if (e.key === 'Escape') {
        const hasDrawer = document.body.classList.contains('drawer-open')
        const hasConfirm = typeof window._lambs_confirm_close === 'function'
        const dd = document.querySelector('.dropdown')
        const hasDropdown = dd && dd.style.opacity !== '0'
        if (showHelp || hasDrawer || hasConfirm || hasDropdown) {
          if (hasDrawer && typeof window._lambs_close_drawer === 'function') {
            window._lambs_close_drawer() // DrawerProvider 同步 state + class/inert
          }
          setShowHelp(false)
          if (hasConfirm) window._lambs_confirm_close()
          if (dd) { dd.style.opacity = '0'; dd.style.pointerEvents = 'none' }
          e.preventDefault()
        }
        return
      }
      if (!e.altKey) return
      e.preventDefault()
      if (e.key === 'd' || e.key === 'D') navigate('/dashboard')
      else if (e.key === 'u' || e.key === 'U') navigate('/users')
      else if (e.key === 'n' || e.key === 'N') navigate('/notifications')
      else if (e.key === 's' || e.key === 'S') navigate('/settings')
      else if ((e.key === 'k' || e.key === 'K') && location.pathname === '/dashboard') {
        const btn = document.querySelector('.btn-primary.btn-sm')
        if (btn && btn.textContent.includes('新增')) btn.click()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, location.pathname])

  // tabindex + role sweep on render (replaces prototype's renderIcons sweep)
  useEffect(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.nav-item,.tab-item,.f-chip,.role-nav-item,.theme-card,.project-card').forEach(el => {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
      })
    })
  }, [location.pathname])

  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const goOff = () => setOffline(true)
    const goOn = () => setOffline(false)
    window.addEventListener('offline', goOff)
    window.addEventListener('online', goOn)
    return () => { window.removeEventListener('offline', goOff); window.removeEventListener('online', goOn) }
  }, [])

  const { user } = useAuth()
  const RequireRole = ({ role, children }) => {
    if (!user || (role && user.role !== role && user.role !== 'super_admin')) return <Navigate to="/dashboard" replace />
    return children
  }

  return (
    <ErrorBoundary>
    <div className="app-container">
      <Sidebar />
      <div className="main">
        <Topbar />
        {offline && (
          <div style={{ background:'var(--accent-red-dim)', borderBottom:'1px solid var(--accent-red)', padding:'8px 28px', fontSize:12, color:'var(--accent-red)', textAlign:'center' }}>
            网络连接已断开，部分功能不可用
          </div>
        )}
        <div className="content">
          <div className="screen active" style={{flex:1}}>
          <Suspense fallback={<div className="empty-state"><div className="t">加载中…</div></div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/project/:id" element={<ProjectDetail />} />
            <Route path="/users" element={<RequireRole role="super_admin"><Users /></RequireRole>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<RequireRole role="super_admin"><Settings /></RequireRole>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
          </div>
        </div>
      </div>
      {showHelp && (
        <div className="modal-overlay open" onClick={() => setShowHelp(false)}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">键盘快捷键</div>
            <div style={{ display:'flex',flexDirection:'column',gap:8,fontSize:'12.5px' }}>
              {[
                ['仪表盘','Alt + D'],['用户管理','Alt + U'],['通知中心','Alt + N'],
                ['系统设置','Alt + S'],['新增项目','Alt + K'],['关闭抽屉/弹窗','Esc / Alt + Esc'],
                ['快捷键帮助','? / Alt + /'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between' }}>
                  <span>{k}</span>
                  <kbd style={{ background:'var(--bg-panel-raised)',padding:'2px 8px',borderRadius:4,fontFamily:'var(--font-mono)',fontSize:11 }}>{v}</kbd>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="login-overlay"><div className="skeleton" style={{width:120,height:18}} /></div>
  if (!user) return <Suspense fallback={<div className="login-overlay"><div className="skeleton" style={{width:120,height:18}} /></div>}><Login /></Suspense>
  return <AppInner />
}
