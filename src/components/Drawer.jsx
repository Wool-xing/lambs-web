import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'
import Icon from './Icon'

const DrawerContext = createContext(null)
export const useDrawer = () => useContext(DrawerContext)

export function DrawerProvider({ children }) {
  const [state, setState] = useState({ open: false, title: '', content: null, width: 0 })
  const [closing, setClosing] = useState(false)
  const drawerRef = useRef(null)
  useFocusTrap(drawerRef, state.open)

  useEffect(() => {
    const sidebar = document.querySelector('.sidebar')
    const main = document.querySelector('.main')
    if (state.open) {
      document.body.classList.add('drawer-open')
      sidebar?.setAttribute('inert', '')
      main?.setAttribute('inert', '')
    } else {
      document.body.classList.remove('drawer-open')
      sidebar?.removeAttribute('inert')
      main?.removeAttribute('inert')
    }
  }, [state.open])

  const openDrawer = useCallback((title, content, width) => {
    setState({ open: true, title, content, width: width || 0 })
  }, [])

  const closeDrawer = useCallback(() => {
    // 退场动画：先 closing（200ms 滑出），再卸载 (R22)
    setClosing(true)
    setTimeout(() => {
      setState({ open: false, title: '', content: null, width: 0 })
      setClosing(false)
    }, 200)
  }, [])

  // Esc 全局关闭桥：App 层 Esc 走这里，状态与 class/inert 保持同步 (R19)
  useEffect(() => {
    window._lambs_close_drawer = closeDrawer
    return () => { delete window._lambs_close_drawer }
  }, [closeDrawer])

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      {children}
      {state.open && (
        <>
          <div className={`drawer-mask${closing ? ' closing' : ''}`} onClick={closeDrawer} />
          <div className={`drawer${closing ? ' closing' : ''}`} ref={drawerRef} role="dialog" aria-modal="true" aria-label={state.title} style={state.width ? { width: state.width } : undefined}>
            <div className="drawer-header">
              <div className="drawer-title">{state.title}</div>
              <button className="drawer-close" onClick={closeDrawer} aria-label="关闭抽屉"><Icon name="x" size={16} /></button>
            </div>
            {state.content}
          </div>
        </>
      )}
    </DrawerContext.Provider>
  )
}
