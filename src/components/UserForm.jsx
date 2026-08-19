import { useState, useEffect, useRef } from 'react'
import { api, hashPassword, newSaltHex } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import TypeSelect from './TypeSelect'

export default function UserForm({ onDone, userData }) {
  const { user: currentAdmin } = useAuth()
  const currentAdminUsername = currentAdmin?.username || ''
  const toast = useToast()
  const avatarRef = useRef(null)
  const isEdit = !!userData
  const [username, setUsername] = useState(userData?.username || '')
  const [name, setName] = useState(userData?.name || '')
  const [email, setEmail] = useState(userData?.email || '')
  const [role, setRole] = useState(userData?.role || 'viewer')
  const [status, setStatus] = useState(userData?.status || 'active')
  const [avatarUrl, setAvatarUrl] = useState(userData?.avatar_url || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPwdSection, setShowPwdSection] = useState(false)
  const [projects, setProjects] = useState([])
  const [access, setAccess] = useState(() => {
    if (!userData?.project_access) return []
    if (Array.isArray(userData.project_access)) return userData.project_access
    try { return JSON.parse(userData.project_access) } catch { return [] }
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/projects?sort_by=order').then(res => {
      if (res.success) setProjects(res.data.projects || [])
    }).catch(() => {})
  }, [])

  const isSuperAdmin = role === 'super_admin'

  const toggleAccess = (pid) => {
    if (isSuperAdmin) return
    setAccess(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])
  }

  const handleAvatar = (file) => {
    if (!file) return
    if (!['image/png','image/jpeg','image/svg+xml','image/webp'].includes(file.type)) { toast('仅支持 PNG/JPG/SVG/WebP', 'error'); return }
    if (file.size > 5*1024*1024) { toast('头像大小不超过 5MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = () => setAvatarUrl(reader.result)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !name || !email) { toast('用户名、姓名和邮箱为必填', 'error'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('邮箱格式不正确', 'error'); return }
    if (showPwdSection && newPassword) {
      if (!oldPassword) { toast('请输入原密码', 'error'); return }
      if (newPassword.length < 6) { toast('新密码至少6位', 'error'); return }
      if (newPassword !== confirmPassword) { toast('两次密码不一致', 'error'); return }
    }
    setLoading(true)
    try {
      const pa = isSuperAdmin ? [] : access
      if (isEdit) {
        const payload = { username, name, email, role, project_access: JSON.stringify(pa), status, avatar_url: avatarUrl || null }
        if (showPwdSection && newPassword) {
          // R7: hash both passwords — new with the target account's salt,
          // the admin's confirmation with the admin's own salt. Plaintext
          // never leaves the browser (R12, the edit branch was missed in R7).
          const targetSalt = (await api.get(`/auth/salt?username=${encodeURIComponent(userData.username || '')}`))?.data?.salt || ''
          const adminSalt = (await api.get(`/auth/salt?username=${encodeURIComponent(currentAdminUsername || '')}`))?.data?.salt || ''
          payload.password = await hashPassword(newPassword, targetSalt)
          payload.old_password = await hashPassword(oldPassword, adminSalt)
        }
        await api.put(`/users/${userData.id}`, payload)
        toast(newPassword ? `${name} 已更新（含密码）` : `${name} 已更新`)
      } else {
        if (newPassword && newPassword.length < 6) { toast('密码至少6位', 'error'); setLoading(false); return }
        if (newPassword && newPassword !== confirmPassword) { toast('两次密码不一致', 'error'); setLoading(false); return }
        const payload = { username, name, email, role, project_access: JSON.stringify(pa), avatar_url: avatarUrl || null }
        if (newPassword) {
          // R7: hash with a locally generated salt — plaintext never leaves
          // the browser.
          const salt = newSaltHex()
          payload.password = await hashPassword(newPassword, salt)
          payload.salt = salt
        }
        const res = await api.post('/users', payload)
        toast(newPassword ? '用户已创建' : `用户已创建，初始密码：${res.data.password}`)
      }
      onDone()
      window.dispatchEvent(new Event('lambs-profile-changed'))
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>头像</label>
        <div
          className={`upload-zone avatar-upload ${avatarUrl ? 'has-image' : ''}`}
          onClick={() => avatarRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation()
            handleAvatar(e.dataTransfer.files[0])
          }}
          style={{ width: 80, height: 80, borderRadius: '50%', cursor: 'pointer' }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span className="upload-hint" style={{ fontSize: 10 }}>上传头像</span>
          )}
        </div>
        <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: 'none' }} onChange={(e) => handleAvatar(e.target.files[0])} />
      </div>
      <div className="field">
        <label>用户名<span className="req">*</span></label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入用户名" />
      </div>
      <div className="field">
        <label>姓名<span className="req">*</span></label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="请输入姓名" />
      </div>
      <div className="field">
        <label>邮箱<span className="req">*</span></label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱" />
      </div>
      {!isEdit && (
        <>
          <div className="field">
            <label>密码<span className="opt">（可选，留空自动生成）</span></label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="至少6位，留空自动生成" autoComplete="new-password" />
          </div>
          <div className="field">
            <label>确认密码<span className="opt">（可选）</span></label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入密码" autoComplete="new-password" />
          </div>
        </>
      )}
      {isEdit && (
        <>
          {!showPwdSection ? (
            <div className="field">
              <label></label>
              <span style={{ fontSize: 12, color: 'var(--accent-cyan)', cursor: 'pointer' }}
                onClick={() => setShowPwdSection(true)}>+ 修改密码</span>
            </div>
          ) : (
            <>
              <div className="field">
                <label>原密码</label>
                <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="输入当前密码以验证" autoComplete="current-password" />
              </div>
              <div className="field">
                <label>新密码</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="输入新密码，至少6位" autoComplete="new-password" />
              </div>
              <div className="field">
                <label>确认密码<span className="opt">（可选）</span></label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" autoComplete="new-password" />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer', marginBottom: 8, display: 'inline-block' }}
                onClick={() => { setShowPwdSection(false); setOldPassword(''); setNewPassword(''); setConfirmPassword('') }}>取消修改密码</span>
            </>
          )}
        </>
      )}
      <div className="field">
        <label>角色</label>
        <TypeSelect
          value={{ super_admin: '超级管理员', project_admin: '项目管理员', viewer: '查看者' }[role]}
          onChange={v => setRole({ '超级管理员': 'super_admin', '项目管理员': 'project_admin', '查看者': 'viewer' }[v])}
          options={['超级管理员', '项目管理员', '查看者']}
        />
      </div>
      {isEdit && (
        <div className="field">
          <label>账号状态</label>
          <TypeSelect
            value={{ active: '正常', disabled: '禁用' }[status]}
            onChange={v => setStatus({ '正常': 'active', '禁用': 'disabled' }[v])}
            options={['正常', '禁用']}
          />
        </div>
      )}
      <div className="field">
        <label>项目访问权限</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {projects.map(p => (
            <div key={p.id} className="check-row">
              <input type="checkbox" id={`pa-${p.id}`} checked={isSuperAdmin || access.includes(p.id)} disabled={isSuperAdmin}
                onChange={() => toggleAccess(p.id)} />
              <label htmlFor={`pa-${p.id}`} style={{ cursor: 'pointer' }}>{p.name}</label>
            </div>
          ))}
          {projects.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>暂无可分配项目</span>}
        </div>
      </div>
      <div className="drawer-actions">
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
          {loading ? '保存中…' : '保存'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onDone}>取消</button>
      </div>
    </form>
  )
}
