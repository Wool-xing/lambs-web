import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Icon from '../components/Icon'
import { applyTheme } from '../components/ThemePicker'
import { resolveAsset, api, hashPassword } from '../api/client'

export default function Login() {
  const { login, register } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)

  // Register modal
  const [showRegister, setShowRegister] = useState(false)
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regShowPwd, setRegShowPwd] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

  // Forgot password — 2-step flow (real email only, no fallback)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotStep, setForgotStep] = useState(1)
  const [forgotUser, setForgotUser] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotCode, setForgotCode] = useState('')
  const [forgotNewPwd, setForgotNewPwd] = useState('')
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState('')
  const [forgotShowPwd, setForgotShowPwd] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotCooldown, setForgotCooldown] = useState(0)
  const [brandLogo, setBrandLogo] = useState(localStorage.getItem('lambs_brand_logo_img') || '')

  useEffect(() => {
    applyTheme(localStorage.getItem('lambs_theme') || 'dark-default')
    if (window.setLambsFavicon) window.setLambsFavicon(localStorage.getItem('lambs_brand_logo_img'))
  }, [])

  // Pre-fill credentials from "remember me" storage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lambs-remember'))
      if (saved) {
        setUsername(saved.username || '')
        setRemember(true)
      }
    } catch { /* ignore */ }
  }, [])

  const cooldownTimer = useRef(null)
  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current) }, [])

  const apiUrl = (path) => {
    const base = import.meta.env.BASE_URL === '/' ? '/api' : import.meta.env.BASE_URL + 'api'
    return base + path
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim()) { toast('请输入用户名', 'error'); return }
    if (!password) { toast('请输入密码', 'error'); return }
    setLoading(true)
    try {
      await login(username.trim(), password, remember)
      if (remember) {
        // Username only — never persist passwords in plain text.
        localStorage.setItem('lambs-remember', JSON.stringify({ username: username.trim() }))
      } else {
        localStorage.removeItem('lambs-remember')
      }
      setPassword('')
    } catch (err) {
      toast(err.message || '登录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Step 1: send verification code via real email
  const handleForgotRequest = async (e) => {
    e.preventDefault()
    if (!forgotUser.trim()) { toast('请输入用户名', 'error'); return }
    if (!forgotEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) { toast('请输入正确的邮箱', 'error'); return }
    setForgotLoading(true)
    try {
      const res = await fetch(apiUrl('/auth/forgot-password/request'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUser.trim(), email: forgotEmail.trim() })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(data.data.message, 'success')
        setForgotStep(2)
        // Start 60s resend cooldown
        setForgotCooldown(60)
        if (cooldownTimer.current) clearInterval(cooldownTimer.current)
        cooldownTimer.current = setInterval(() => {
          setForgotCooldown(prev => { if (prev <= 1) { clearInterval(cooldownTimer.current); return 0 } return prev - 1 })
        }, 1000)
      } else {
        toast(data.error || data.detail || '请求失败', 'error')
      }
    } catch { toast('网络错误', 'error') }
    finally { setForgotLoading(false) }
  }

  // Step 2: verify code + set new password
  const handleForgotVerify = async (e) => {
    e.preventDefault()
    const code = forgotCode.trim()
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) { toast('请输入6位数字验证码', 'error'); return }
    if (!forgotNewPwd || forgotNewPwd.length < 6) { toast('新密码至少6位', 'error'); return }
    if (forgotNewPwd !== forgotConfirmPwd) { toast('两次输入的密码不一致', 'error'); return }
    setForgotLoading(true)
    try {
      // R7: hash the new password with the account salt before sending.
      let salt = ''
      try {
        const s = await api.get(`/auth/salt?username=${encodeURIComponent(forgotUser.trim())}`)
        salt = s.data?.salt || ''
      } catch { /* empty-salt fallback */ }
      const payload = await hashPassword(forgotNewPwd, salt)
      const res = await fetch(apiUrl('/auth/forgot-password/verify'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUser.trim(), email: forgotEmail.trim(), code, new_password: payload })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast('密码已重置，请使用新密码登录', 'success')
        closeForgot()
      } else {
        toast(data.error || data.detail || '验证失败', 'error')
      }
    } catch { toast('网络错误', 'error') }
    finally { setForgotLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!regUsername.trim()) { toast('请输入用户名', 'error'); return }
    if (!regEmail.trim()) { toast('请输入邮箱', 'error'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) { toast('邮箱格式不正确', 'error'); return }
    if (!regPassword || regPassword.length < 6) { toast('密码至少6位', 'error'); return }
    setRegLoading(true)
    try {
      await register(regUsername.trim(), regEmail.trim(), regPassword)
      toast('注册成功！已自动登录', 'success')
      setShowRegister(false)
    } catch (err) {
      toast(err.message || '注册失败', 'error')
    } finally {
      setRegLoading(false)
    }
  }

  const openForgot = () => { setShowForgot(true); setForgotStep(1); setForgotUser(''); setForgotEmail(''); setForgotCode(''); setForgotNewPwd(''); setForgotConfirmPwd(''); setForgotCooldown(0) }
  const closeForgot = () => { setShowForgot(false); setForgotStep(1) }
  const openRegister = () => { setShowRegister(true); setRegUsername(''); setRegEmail(''); setRegPassword('') }

  return (
    <div className="login-overlay">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          {brandLogo ? <img src={resolveAsset(brandLogo)} alt="" style={{width:'100%',height:'100%',borderRadius:'10px',objectFit:'cover'}} /> : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          )}
        </div>
        <div className="login-title">Lambs管理系统</div>
        <div className="login-sub">开源免费 · 统一管理所有项目</div>
        <div className="field">
          <label htmlFor="login-username">用户名<span className="req">*</span></label>
          <input id="login-username" value={username} onChange={e => setUsername(e.target.value)} placeholder="请输入用户名" autoComplete="username" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="login-pass">密码<span className="req">*</span></label>
          <div className="pwd-wrap">
            <input id="login-pass" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" />
            <button type="button" className="pwd-eye" aria-label={showPwd ? '隐藏密码' : '显示密码'} onClick={() => setShowPwd(!showPwd)}><Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} /></button>
          </div>
        </div>
        <div className="check-row" style={{ marginBottom: 6 }}>
          <input type="checkbox" id="remember-me" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <label htmlFor="remember-me" style={{ cursor: 'pointer' }}>记住我</label>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div style={{ marginTop: 14, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 24 }}>
          <span style={{ fontSize: 12, color: 'var(--accent-cyan)', cursor: 'pointer' }} onClick={openForgot}>忘记密码？</span>
          <span style={{ fontSize: 12, color: 'var(--accent-cyan)', cursor: 'pointer' }} onClick={openRegister}>注册新账号</span>
        </div>
      </form>

      {/* Forgot Password Modal — Step 1: verify identity */}
      {showForgot && forgotStep === 1 && (
        <div className="modal-overlay open" onClick={closeForgot}>
          <form className="modal-box" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onSubmit={handleForgotRequest}>
            <div className="modal-title">重置密码</div>
            <div className="modal-desc">输入用户名和注册邮箱，验证码将发送至您的邮箱。</div>
            <div className="field">
              <label htmlFor="forgot-username">用户名<span className="req">*</span></label>
              <input id="forgot-username" value={forgotUser} onChange={e => setForgotUser(e.target.value)} placeholder="请输入用户名" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="forgot-email">注册邮箱<span className="req">*</span></label>
              <input id="forgot-email" type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="请输入注册时使用的邮箱" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeForgot}>取消</button>
              <button className="btn btn-primary" disabled={forgotLoading}>{forgotLoading ? '发送中…' : '发送验证码'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Forgot Password Modal — Step 2: verify code + set password */}
      {showForgot && forgotStep === 2 && (
        <div className="modal-overlay open" onClick={closeForgot}>
          <form className="modal-box" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onSubmit={handleForgotVerify}>
            <div className="modal-title">重置密码</div>
            <div className="modal-desc">
              验证码已发送至 <strong>{forgotEmail}</strong>，有效期5分钟。
              {forgotCooldown > 0 ? (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> {forgotCooldown}秒后可重发</span>
              ) : (
                <span style={{ color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: 11, marginLeft: 8 }}
                  onClick={(e) => { e.preventDefault(); setForgotStep(1) }}>重新发送</span>
              )}
            </div>
            <div className="field">
              <label>验证码<span className="req">*</span></label>
              <input value={forgotCode} onChange={e => setForgotCode(e.target.value)} placeholder="请输入6位数字验证码" maxLength={6} autoFocus />
            </div>
            <div className="field">
              <label>新密码<span className="req">*</span></label>
              <div className="pwd-wrap">
                <input type={forgotShowPwd ? 'text' : 'password'} value={forgotNewPwd} onChange={e => setForgotNewPwd(e.target.value)} placeholder="至少6位新密码" />
                <button type="button" className="pwd-eye" aria-label={forgotShowPwd ? '隐藏密码' : '显示密码'} onClick={() => setForgotShowPwd(!forgotShowPwd)}><Icon name={forgotShowPwd ? 'eyeOff' : 'eye'} size={18} /></button>
              </div>
            </div>
            <div className="field">
              <label>确认密码<span className="req">*</span></label>
              <input type="password" value={forgotConfirmPwd} onChange={e => setForgotConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForgotStep(1)}>上一步</button>
              <button className="btn btn-primary" disabled={forgotLoading}>{forgotLoading ? '重置中…' : '重置密码'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div className="modal-overlay open" onClick={() => setShowRegister(false)}>
          <form className="modal-box" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onSubmit={handleRegister}>
            <div className="modal-title">注册新账号</div>
            <div className="modal-desc">注册后默认拥有查看者权限，管理员可调整角色。</div>
            <div className="field">
              <label>用户名<span className="req">*</span></label>
              <input value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="请输入用户名" autoFocus />
            </div>
            <div className="field">
              <label>邮箱<span className="req">*</span></label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="请输入邮箱" />
            </div>
            <div className="field">
              <label>密码</label>
              <div className="pwd-wrap">
                <input type={regShowPwd ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="至少6位密码" />
                <button type="button" className="pwd-eye" aria-label={regShowPwd ? '隐藏密码' : '显示密码'} onClick={() => setRegShowPwd(!regShowPwd)}><Icon name={regShowPwd ? 'eyeOff' : 'eye'} size={18} /></button>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowRegister(false)}>取消</button>
              <button className="btn btn-primary" disabled={regLoading}>{regLoading ? '注册中…' : '注册'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
