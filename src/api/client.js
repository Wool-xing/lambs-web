// Vite dev proxy routes /api → localhost:8000
// Production nginx routes /Lambs/api/ → backend
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

// fetchWithTimeout aborts requests that hang (weak network / dead proxy).
async function fetchWithTimeout(url, opts, ms = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// isRetryable: transient failures worth one retry (GETs only — writes must
// never be silently re-sent, they could double-apply).
function isRetryable(status) {
  return status === 0 || status === 502 || status === 503 || status === 504
}

// In-flight GET dedupe: concurrent mounts fire the same query (Sidebar +
// Dashboard both fetch /projects on first paint); collapse to one round trip.
// Entries are removed once settled, so 30s polling still refetches.
const inflightGets = new Map()

async function request(path, options = {}) {
  const token = getToken()
  if (token && isTokenExpired(token)) { clearAuth(); throw new Error('登录已过期') }
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const method = (options.method || 'GET').toUpperCase()
  // Dedupe key is path-only: safe today because every api.get caller passes
  // no custom headers. Pass { dedupe: false } for explicit refreshes that
  // must not collapse onto a concurrent in-flight poll (stale data race).
  if (method === 'GET' && options.dedupe !== false) {
    const pending = inflightGets.get(path)
    if (pending) return pending
    const p = doRequest(path, options, headers, method)
    inflightGets.set(path, p)
    try { return await p } finally { inflightGets.delete(path) }
  }
  return doRequest(path, options, headers, method)
}

async function doRequest(path, options, headers, method) {
  let attempts = 1
  if (method === 'GET') attempts = 2 // one retry for transient failures

  let res
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      res = await fetchWithTimeout(BASE + path, { ...options, headers })
      if (!res.ok && isRetryable(res.status) && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 600))
        continue
      }
      break
    } catch (err) {
      lastErr = err
      if (i === attempts - 1) {
        throw new Error('网络异常，请检查连接')
      }
      await new Promise(r => setTimeout(r, 600))
    }
  }
  if (!res) throw lastErr || new Error('网络异常')

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
  get: (path, options) => request(path, options),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

// hashPassword computes sha256hex(password+salt) via Web Crypto. The salt is
// public per-user data — this layer keeps the raw password out of DevTools
// and the wire (R7); TLS + server bcrypt remain the actual security.
export async function hashPassword(password, salt = '') {
  // crypto.subtle only exists on HTTPS/localhost — fail with a readable
  // Chinese message instead of a raw TypeError (R7 code review).
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('当前环境不支持安全哈希，请使用 HTTPS 访问')
  }
  const data = new TextEncoder().encode(password + salt)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// newSaltHex returns a random 16-byte salt for account creation (the server
// stores it alongside the bcrypt hash).
export function newSaltHex() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// resolveAsset resolves server-relative API paths (like logo URLs returned
// by the API) against the app base path — "/api/x" must become "/Lambs/api/x".
// Only "/api" paths get the prefix: other absolute paths ("/static/...",
// protocol-relative "//cdn/...") are app/domain-root correct as-is (R3-P3).
export function resolveAsset(src) {
  if (!src || typeof src !== 'string') return src
  if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('//')) return src
  if (src === '/api' || src.startsWith('/api/')) {
    const base = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
    if (base && !src.startsWith(base + '/')) return base + src
  }
  return src
}
