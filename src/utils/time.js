// Format ISO timestamps to Beijing time (UTC+8), output: YYYY-MM-DD HH:MM:SS
// Non-date values (numbers, plain strings) are returned unchanged.
export function fmtTime(val) {
  if (!val) return '—'
  const s = String(val)
  // Only attempt date formatting for values that look like dates/timestamps
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  try {
    const raw = s.replace(' ', 'T')
    const d = new Date(raw + (raw.endsWith('Z') ? '' : 'Z'))
    if (isNaN(d.getTime())) return raw.substring(0, 19).replace('T', ' ')
    // Manual format: consistent across all browsers
    const bj = new Date(d.getTime() + 8 * 3600000)
    const Y = bj.getUTCFullYear()
    const M = String(bj.getUTCMonth() + 1).padStart(2, '0')
    const D = String(bj.getUTCDate()).padStart(2, '0')
    const h = String(bj.getUTCHours()).padStart(2, '0')
    const m = String(bj.getUTCMinutes()).padStart(2, '0')
    const sec = String(bj.getUTCSeconds()).padStart(2, '0')
    return `${Y}-${M}-${D} ${h}:${m}:${sec}`
  } catch { return s.substring(0, 19).replace('T', ' ') }
}

// Relative time: 刚刚 / N分钟前 / N小时前 / N天前,older falls back to fmtTime.
export function fmtRelative(val) {
  const s = String(val || '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  try {
    const raw = s.replace(' ', 'T')
    const d = new Date(raw + (raw.endsWith('Z') ? '' : 'Z'))
    if (isNaN(d.getTime())) return s.substring(0, 16)
    const diff = Date.now() - d.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '刚刚'
    if (min < 60) return `${min} 分钟前`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} 小时前`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day} 天前`
    return fmtTime(val).substring(0, 16)
  } catch { return s.substring(0, 16) }
}
