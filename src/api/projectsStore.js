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
const listeners = new Set()

export function subscribeProjects(fn) {
  listeners.add(fn)
  if (cache) fn(cache)
  return () => listeners.delete(fn)
}

export function fetchProjectsShared(force = false) {
  if (inflight && !force) return inflight
  inflight = api.get('/projects?sort_by=order').then((res) => {
    if (res.success) {
      cache = res.data.projects || []
      listeners.forEach((l) => l(cache))
    }
    return cache
  })
  return inflight
}
