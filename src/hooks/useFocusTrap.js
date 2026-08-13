import { useEffect } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function useFocusTrap(containerRef, active = true) {
  useEffect(() => {
    if (!active || !containerRef.current) return
    const el = containerRef.current

    // Auto-focus first focusable element on open
    requestAnimationFrame(() => {
      const first = el.querySelector(FOCUSABLE)
      if (first) first.focus()
    })

    const handler = (e) => {
      if (e.key !== 'Tab') return
      const items = el.querySelectorAll(FOCUSABLE)
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [active])
}
