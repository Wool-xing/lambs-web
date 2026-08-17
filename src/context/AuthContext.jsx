import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, hashPassword, newSaltHex } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const getToken = () => localStorage.getItem('lambs_token') || sessionStorage.getItem('lambs_token')
  const clearToken = () => { localStorage.removeItem('lambs_token'); sessionStorage.removeItem('lambs_token') }

  const fetchMe = useCallback(async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    try {
      const res = await api.get('/auth/me')
      if (res.success) setUser(res.data)
    } catch {
      clearToken()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
    const onExpired = () => setUser(null)
    window.addEventListener('lambs-auth-expired', onExpired)
    const onProfileChanged = () => fetchMe()
    window.addEventListener('lambs-profile-changed', onProfileChanged)
    return () => {
      window.removeEventListener('lambs-auth-expired', onExpired)
      window.removeEventListener('lambs-profile-changed', onProfileChanged)
    }
  }, [fetchMe])

  const login = async (username, password, remember) => {
    // R7: fetch the account salt, send sha256(password+salt) — raw password
    // never leaves the browser.
    let salt = ''
    try {
      const s = await api.get(`/auth/salt?username=${encodeURIComponent(username)}`)
      salt = s.data?.salt || ''
    } catch { /* salt lookup failure must not block login (empty-salt fallback) */ }
    const payload = await hashPassword(password, salt)
    const res = await api.post('/auth/login', { username, password: payload })
    if (res.success) {
      const store = remember ? localStorage : sessionStorage
      store.setItem('lambs_token', res.data.access_token)
      await fetchMe()
    }
  }

  const register = async (username, email, password) => {
    // New accounts generate their own salt locally and send it alongside
    // the hashed payload (R7).
    const salt = newSaltHex()
    const payload = await hashPassword(password, salt)
    const res = await api.post('/auth/register', { username, email, password: payload, salt })
    if (res.success) {
      localStorage.setItem('lambs_token', res.data.access_token)
      await fetchMe()
    }
  }

  const logout = () => {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
