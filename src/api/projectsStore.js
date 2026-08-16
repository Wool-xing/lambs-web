import { api } from './client'

// Shared "sort_by=order" project list — Sidebar and Dashboard both fetch it
// on mount; without this the same request fires twice on first load (the
// client's in-flight dedupe does not collapse them, verified empirically).
//
// The in-flight promise is kept FOREVER so concurrent/repeated mount-time
// calls (incl. React StrictMode's dev double-mount) share one request.
// Callers that need fresh data (30s poll, project-changed event, refresh
// button) pass force=true to bypass the cache.
let cache = null
let inflight = null
let lastForceAt = 0
const listeners = new Set()

export function subscribeProjects(fn) {
  listeners.add(fn)
  if (cache) fn(cache)
  return () => listeners.delete(fn)
}

export function fetchProjectsShared(force = false) {
  if (inflight && !force) return inflight
  // force 刷新必须绕过 client 层的 in-flight 去重：否则可能合并进并发中的
  // 30s 轮询请求，拿到轮询开始时的旧快照（R5 F2）。
  // 但 afterMutate 的 force 与随后 lambs-projects-changed 事件触发的 force
  // 各发一次重复 GET——500ms 窗口内合并（R6）。
  const now = Date.now()
  if (force && inflight && now - lastForceAt < 500) return inflight
  lastForceAt = now
  inflight = api.get('/projects?sort_by=order', force ? { dedupe: false } : undefined).then((res) => {
    if (res.success) {
      cache = res.data.projects || []
      listeners.forEach((l) => l(cache))
    }
    return cache
  })
  return inflight
}
