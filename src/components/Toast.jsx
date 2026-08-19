import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    // 退场动画：2860ms 进入 leaving 态（120ms fade），不硬切 (R22)
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 120)
    }, 2860)
  }, [])
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          // role=alert: screen readers announce the message (R13 a11y).
          <div key={t.id} role="alert" className={`toast toast ${t.type}${t.leaving ? ' leaving' : ''}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
