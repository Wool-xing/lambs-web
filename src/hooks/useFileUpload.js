import { useState } from 'react'

const MAX_DIM = 256 // max width/height for logo resize

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { resolve(file); return }
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width <= MAX_DIM && height <= MAX_DIM) { resolve(file); return }
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
      const c = document.createElement('canvas')
      c.width = Math.round(width * ratio)
      c.height = Math.round(height * ratio)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(blob => {
        if (blob) resolve(new File([blob], file.name, { type: 'image/png' }))
        else resolve(file)
      }, 'image/png', 0.85)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

// Shared file→base64 dataURL hook. Used by ProjectForm, Settings, UserForm.
export default function useFileUpload(opts = {}) {
  const { maxMB = 5, accept = ['image/png','image/jpeg','image/svg+xml','image/webp'], onError } = opts
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)

  const validate = (file) => {
    if (!file) return false
    if (accept.length && !accept.includes(file.type)) { onError?.('仅支持 PNG/JPG/SVG/WebP'); return false }
    if (file.size > maxMB * 1024 * 1024) { onError?.(`文件超过 ${maxMB}MB`); return false }
    return true
  }

  const handleFile = async (file) => {
    if (!file || uploading) return
    if (!validate(file)) return
    setUploading(true)
    try {
      const resized = await resizeImage(file)
      const r = new FileReader()
      r.onload = () => { setPreview(r.result); opts.onChange?.(r.result); setUploading(false) }
      r.readAsDataURL(resized)
    } catch { setUploading(false) }
  }

  const reset = () => { setPreview(''); setUploading(false) }

  return { preview, handleFile, reset, setPreview, uploading }
}
