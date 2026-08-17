import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          // role=alert: screen readers announce the message (R13 a11y).
          <div key={t.id} role="alert" className={`toast toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
