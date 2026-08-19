import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { fmtTime } from '../utils/time'

export default function Notifications() {
  const toast = useToast()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState([])
  const [unread, setUnread] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 20

  const fetchNotifs = useCallback(async (pg) => {
    try {
      const res = await api.get(`/notifications?type=${typeFilter}&page=${pg||1}&page_size=${PAGE_SIZE}`)
      if (res.success) {
        if (pg && pg > 1) setNotifs(prev => [...prev, ...res.data.notifications])
        else setNotifs(res.data.notifications)
        setUnread(res.data.unread_count)
        setHasMore(res.data.notifications.length === PAGE_SIZE)
        setLoadError(false)
      } else setLoadError(true)
    } catch { setLoadError(true) }
  }, [typeFilter])

  useEffect(() => { setPage(1); fetchNotifs(1) }, [fetchNotifs])

  const loadMore = () => { const np = page + 1; setPage(np); fetchNotifs(np) }

  const refreshBadge = () => window.dispatchEvent(new Event('lambs-notifs-changed'))

  const handleMarkRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`)
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnread(prev => prev - 1)
      refreshBadge()
    } catch (e) { toast(e.message, 'error') }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      setUnread(0)
      toast('已全部标记为已读')
      refreshBadge()
    } catch (e) { toast(e.message, 'error') }
  }

  const handleDismiss = async (id) => {
    try {
      await api.delete(`/notifications/${id}`)
      // Refetch OUTSIDE the state updater — a fetch inside it double-fires
      // under StrictMode's double-invoked updaters (R12).
      setNotifs(prev => prev.filter(n => n.id !== id))
      refreshBadge()
      if (notifs.length < 10 && hasMore) fetchNotifs(1)
    } catch (e) { toast(e.message, 'error') }
  }

  const typeLabel = (t) => t === 'alert' ? '告警' : t === 'info' ? '信息' : '成功'

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">通知中心</div>
        <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>全部已读</button>
      </div>

      <div className="filter-chips" style={{ marginBottom: 14 }}>
        {['all','alert','info','success'].map(t => (
          <div key={t} className={`f-chip ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}>
            {t === 'all' ? '全部' : typeLabel(t)}
          </div>
        ))}
      </div>

      {loadError ? (
        <div className="empty-state">
          <div className="t">通知加载失败</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>网络异常或服务不可用</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => fetchNotifs(1)}>重试</button>
        </div>
      ) : notifs.length === 0 ? (
        <div className="empty-state"><div className="t">暂无通知</div></div>
      ) : (
        <div className="notif-list">
          {notifs.map(n => {
            const notifDot = n.type === 'alert' ? 'alert' : n.type === 'info' ? 'info' : 'success'
            return (
              <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}
                onClick={() => { if (n.project_id) { handleMarkRead(n.id); navigate(`/project/${n.project_id}`) } }}>
                <span className={`notif-dot ${notifDot}`} />
                <div className="notif-body">
                  <div className="title">{n.title}</div>
                  <div className="content">{n.content}</div>
                  <div className="meta">{fmtTime(n.created_at)}</div>
                </div>
                <div className="notif-actions">
                  {!n.read && (
                    <button className="btn btn-xs btn-ghost" aria-label="标记已读" onClick={e => { e.stopPropagation(); handleMarkRead(n.id) }}><Icon name="check" size={12} /></button>
                  )}
                  <button className="btn btn-xs btn-ghost" aria-label="删除通知" onClick={e => { e.stopPropagation(); handleDismiss(n.id) }}><Icon name="x" size={12} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {hasMore && notifs.length >= PAGE_SIZE && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadMore}>加载更多</button>
        </div>
      )}
    </div>
  )
}
