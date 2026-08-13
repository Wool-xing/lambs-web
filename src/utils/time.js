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
