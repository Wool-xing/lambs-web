// Vite dev proxy routes /api → localhost:8000
// Production nginx routes /lambs/api/ → backend
const BASE = import.meta.env.BASE_URL === '/' ? '/api' : import.meta.env.BASE_URL + 'api'

function getToken() {
  return localStorage.getItem('lambs_token') || sessionStorage.getItem('lambs_token')
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now()
  } catch { return true }
}

function clearAuth() {
  localStorage.removeItem('lambs_token')
  sessionStorage.removeItem('lambs_token')
  window.dispatchEvent(new Event('lambs-auth-expired'))
}

async function request(path, options = {}) {
  const token = getToken()
  if (token && isTokenExpired(token)) { clearAuth(); throw new Error('登录已过期') }
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { ...options, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) clearAuth()
    const msg = body.detail || body.error || `请求失败 (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return body
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
