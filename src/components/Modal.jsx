import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'

const ConfirmContext = createContext(null)
export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, title: '', desc: '', confirming: false })
  const [resolver, setResolver] = useState(null)
  const modalRef = useRef(null)
  useFocusTrap(modalRef, state.open)

  useEffect(() => { window._lambs_confirm_close = () => { if(state.open) close(false) } }, [state.open])

  const confirm = useCallback((title, desc) => new Promise((resolve) => {
    setState({ open: true, title, desc, confirming: false })
    setResolver(() => resolve)
  }), [])

  const close = (result) => {
    if (state.confirming) return // prevent double click
    setState({ open: false, title: '', desc: '', confirming: false })
    if (resolver) { resolver(result); setResolver(null) }
  }

  const handleConfirm = () => {
    if (state.confirming) return
    setState(prev => ({ ...prev, confirming: true }))
    if (resolver) { resolver(true); setResolver(null); }
    setState({ open: false, title: '', desc: '', confirming: false })
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <div className="modal-overlay open" onClick={() => close(false)}>
          <div className="modal-box" ref={modalRef} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{state.title}</div>
            <div className="modal-desc">{state.desc}</div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => close(false)}>取消</button>
              <button className="btn btn-danger" onClick={handleConfirm} disabled={state.confirming}>确认</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
