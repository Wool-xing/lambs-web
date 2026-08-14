import { useState, useEffect } from 'react'
import Icon from './Icon'

// Full palettes — the default themes only swap gradients/accents; a light or
// pure-black style must also swap background/text/border variables.
const PALETTES = {
  dark: {
    '--bg-deep': '#0B0E13', '--bg-page': '#0E1116', '--bg-panel': '#161B22', '--bg-panel-raised': '#1D232C',
    '--bg-input': '#12161C', '--border': '#262D38', '--border-strong': '#38414F',
    '--text-primary': '#EEF1F5', '--text-secondary': '#8B93A3', '--text-tertiary': '#7A8391',
    '--accent-cyan': '#00C7BE', '--accent-cyan-dim': '#0B3B39',
    '--glass-bg': '22,27,34',
  },
  obsidian: {
    '--bg-deep': '#000000', '--bg-page': '#050605', '--bg-panel': '#0A0C0A', '--bg-panel-raised': '#121512',
    '--bg-input': '#0A0C0A', '--border': '#1E231E', '--border-strong': '#2C342C',
    '--text-primary': '#E9EFE9', '--text-secondary': '#98A698', '--text-tertiary': '#788678',
    '--accent-cyan': '#3FB950', '--accent-cyan-dim': '#0D2814',
    '--glass-bg': '10,12,10',
  },
}

const THEMES = {
  'dark-default': {
    label:'深色默认', desc:'经典暗色 · 青橙微光',
    gradients:'radial-gradient(ellipse at 15% 10%,rgba(0,199,190,.22),transparent 55%),radial-gradient(ellipse at 85% 90%,rgba(255,161,59,.18),transparent 55%),radial-gradient(ellipse at 50% 50%,rgba(184,146,255,.12),transparent 65%),radial-gradient(ellipse at 30% 80%,rgba(56,210,148,.10),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:0,
    accent:'#FFA13B', accentBg:'rgba(255,161,59,.10)', accentBorder:'rgba(255,161,59,.18)', accentGlow:'rgba(255,161,59,.18)'
  },
  'mint-cyan': {
    label:'薄荷青', desc:'科技感 · 青绿主导',
    gradients:'radial-gradient(ellipse at 15% 20%,rgba(0,199,190,.30),transparent 55%),radial-gradient(ellipse at 70% 60%,rgba(56,210,148,.20),transparent 50%),radial-gradient(ellipse at 90% 30%,rgba(0,230,210,.18),transparent 58%),radial-gradient(ellipse at 40% 90%,rgba(0,180,170,.14),transparent 45%)',
    glassAlpha:0.68, blur:24, accentHue:15,
    accent:'#00C7BE', accentBg:'rgba(0,199,190,.10)', accentBorder:'rgba(0,199,190,.18)', accentGlow:'rgba(0,199,190,.18)'
  },
  'warm-amber': {
    label:'暖金琥珀', desc:'温暖深沉 · 金色主调',
    gradients:'radial-gradient(ellipse at 10% 80%,rgba(255,161,59,.28),transparent 55%),radial-gradient(ellipse at 80% 20%,rgba(255,140,30,.20),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(255,180,80,.14),transparent 58%),radial-gradient(ellipse at 60% 90%,rgba(200,130,40,.12),transparent 45%)',
    glassAlpha:0.78, blur:16, accentHue:-30,
    accent:'#FF8C1E', accentBg:'rgba(255,140,30,.10)', accentBorder:'rgba(255,140,30,.18)', accentGlow:'rgba(255,140,30,.18)'
  },
  'ice-blue': {
    label:'冰蓝极光', desc:'清冷通透 · 蓝紫极光',
    gradients:'radial-gradient(ellipse at 20% 30%,rgba(91,156,245,.28),transparent 55%),radial-gradient(ellipse at 80% 60%,rgba(130,150,255,.20),transparent 50%),radial-gradient(ellipse at 50% 80%,rgba(184,146,255,.16),transparent 58%),radial-gradient(ellipse at 40% 10%,rgba(60,200,240,.14),transparent 45%)',
    glassAlpha:0.62, blur:28, accentHue:180,
    accent:'#5B9CF5', accentBg:'rgba(91,156,245,.10)', accentBorder:'rgba(91,156,245,.18)', accentGlow:'rgba(91,156,245,.18)'
  },
  'purple-night': {
    label:'紫夜星辰', desc:'深邃神秘 · 紫色星河',
    gradients:'radial-gradient(ellipse at 30% 20%,rgba(184,146,255,.26),transparent 55%),radial-gradient(ellipse at 70% 80%,rgba(160,120,240,.20),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(200,160,255,.14),transparent 58%),radial-gradient(ellipse at 20% 90%,rgba(130,100,220,.12),transparent 45%)',
    glassAlpha:0.70, blur:22, accentHue:270,
    accent:'#B892FF', accentBg:'rgba(184,146,255,.10)', accentBorder:'rgba(184,146,255,.18)', accentGlow:'rgba(184,146,255,.18)'
  },
  'crimson-night': {
    label:'绯红之夜', desc:'暗红热烈 · 玫红主调',
    gradients:'radial-gradient(ellipse at 15% 15%,rgba(255,93,93,.26),transparent 55%),radial-gradient(ellipse at 80% 70%,rgba(230,70,110,.20),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(255,120,140,.14),transparent 58%),radial-gradient(ellipse at 30% 90%,rgba(180,50,90,.12),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:-50,
    accent:'#FF5D7A', accentBg:'rgba(255,93,122,.10)', accentBorder:'rgba(255,93,122,.18)', accentGlow:'rgba(255,93,122,.18)'
  },
  'obsidian': {
    label:'黑曜石', desc:'纯黑终端 · 幽绿光标',
    palette:'obsidian',
    gradients:'radial-gradient(ellipse at 50% 0%,rgba(63,185,80,.10),transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(63,185,80,.06),transparent 50%)',
    glassAlpha:0.72, blur:20, accentHue:-120,
    accent:'#3FB950', accentBg:'rgba(63,185,80,.10)', accentBorder:'rgba(63,185,80,.18)', accentGlow:'rgba(63,185,80,.14)'
  },
  'deep-ocean': {
    label:'深海蓝', desc:'幽深海域 · 蓝调深邃',
    gradients:'radial-gradient(ellipse at 20% 15%,rgba(61,139,253,.24),transparent 55%),radial-gradient(ellipse at 75% 70%,rgba(30,90,190,.18),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(80,160,255,.12),transparent 58%),radial-gradient(ellipse at 30% 90%,rgba(20,70,150,.10),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:210,
    accent:'#3D8BFD', accentBg:'rgba(61,139,253,.10)', accentBorder:'rgba(61,139,253,.18)', accentGlow:'rgba(61,139,253,.18)'
  },
  'emerald-forest': {
    label:'翡翠森林', desc:'墨绿葱郁 · 翡翠光泽',
    gradients:'radial-gradient(ellipse at 20% 80%,rgba(47,191,113,.24),transparent 55%),radial-gradient(ellipse at 80% 20%,rgba(20,150,90,.18),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(70,200,130,.12),transparent 58%),radial-gradient(ellipse at 60% 10%,rgba(30,160,100,.10),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:-140,
    accent:'#2FBF71', accentBg:'rgba(47,191,113,.10)', accentBorder:'rgba(47,191,113,.18)', accentGlow:'rgba(47,191,113,.18)'
  },
  'sakura': {
    label:'樱花', desc:'粉嫩柔和 · 樱色微光',
    gradients:'radial-gradient(ellipse at 15% 20%,rgba(255,143,171,.24),transparent 55%),radial-gradient(ellipse at 80% 70%,rgba(220,110,150,.18),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(255,170,190,.12),transparent 58%),radial-gradient(ellipse at 30% 90%,rgba(190,90,130,.10),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:-15,
    accent:'#FF8FAB', accentBg:'rgba(255,143,171,.10)', accentBorder:'rgba(255,143,171,.18)', accentGlow:'rgba(255,143,171,.18)'
  },
  'sunset': {
    label:'落日橙', desc:'黄昏灼热 · 橙红余晖',
    gradients:'radial-gradient(ellipse at 80% 20%,rgba(255,110,60,.26),transparent 55%),radial-gradient(ellipse at 20% 70%,rgba(230,80,40,.18),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(255,140,80,.12),transparent 58%),radial-gradient(ellipse at 60% 90%,rgba(200,70,35,.10),transparent 45%)',
    glassAlpha:0.72, blur:20, accentHue:-25,
    accent:'#FF6E3C', accentBg:'rgba(255,110,60,.10)', accentBorder:'rgba(255,110,60,.18)', accentGlow:'rgba(255,110,60,.18)'
  },
  'royal-gold': {
    label:'鎏金', desc:'奢华质感 · 金辉流转',
    gradients:'radial-gradient(ellipse at 20% 10%,rgba(229,181,103,.24),transparent 55%),radial-gradient(ellipse at 80% 80%,rgba(190,140,60,.18),transparent 50%),radial-gradient(ellipse at 50% 50%,rgba(240,200,120,.12),transparent 58%),radial-gradient(ellipse at 40% 90%,rgba(170,120,50,.10),transparent 45%)',
    glassAlpha:0.78, blur:16, accentHue:-45,
    accent:'#E5B567', accentBg:'rgba(229,181,103,.10)', accentBorder:'rgba(229,181,103,.18)', accentGlow:'rgba(229,181,103,.18)'
  },
}

// Auto-extract accent colors from first gradient rgba color. New themes only need gradients.
function extractAccent(gradients) {
  const m = gradients.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return { accent:'#FFA13B', accentBg:'rgba(255,161,59,.10)', accentBorder:'rgba(255,161,59,.18)', accentGlow:'rgba(255,161,59,.18)' }
  const [r,g,b] = [m[1],m[2],m[3]]
  const hex = '#' + [r,g,b].map(n => (+n).toString(16).padStart(2,'0')).join('')
  return { accent:hex, accentBg:`rgba(${r},${g},${b},.10)`, accentBorder:`rgba(${r},${g},${b},.18)`, accentGlow:`rgba(${r},${g},${b},.18)` }
}

export function applyTheme(name) {
  const t = THEMES[name] || THEMES['dark-default']
  // Swap the full palette when the theme declares one; otherwise reset to dark.
  const p = t.palette ? PALETTES[t.palette] : PALETTES.dark
  Object.entries(p).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
  document.documentElement.style.setProperty('--body-gradients', t.gradients)
  if (t.accentHue !== undefined) document.documentElement.style.setProperty('--accent-hue', t.accentHue)
  else document.documentElement.style.setProperty('--accent-hue', 0)
  document.documentElement.style.setProperty('--glass-alpha', t.glassAlpha)
  document.documentElement.style.setProperty('--glass-blur', t.blur + 'px')
  document.documentElement.style.setProperty('--glass-alpha2', (t.glassAlpha - 0.05))
  document.documentElement.style.setProperty('--glass-blur2', (t.blur - 4) + 'px')
  localStorage.setItem('lambs_theme', name)
  document.cookie = 'lambs_theme=' + name + ';path=/;max-age=31536000;SameSite=Lax'
  document.cookie = 'lambs_theme_grad=' + encodeURIComponent(t.gradients) + ';path=/;max-age=31536000;SameSite=Lax'
  const acc = t.accent ? {accent:t.accent, accentBg:t.accentBg, border:t.accentBorder, glow:t.accentGlow} : extractAccent(t.gradients)
  document.cookie = 'lambs_theme_accent=' + encodeURIComponent(JSON.stringify(acc)) + ';path=/;max-age=31536000;SameSite=Lax'
  document.cookie = 'lambs_theme_glass=' + encodeURIComponent(JSON.stringify({alpha:t.glassAlpha,blur:t.blur})) + ';path=/;max-age=31536000;SameSite=Lax'
}

export default function ThemePicker() {
  const [active, setActive] = useState(localStorage.getItem('lambs_theme') || 'dark-default')

  useEffect(() => { applyTheme(active) }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
      {Object.entries(THEMES).map(([key, t]) => (
        <div key={key} className={`theme-card ${key === active ? 'active' : ''}`}
          onClick={() => { setActive(key); applyTheme(key) }}>
          <div className="theme-swatch">
            <div style={{ background: t.gradients.split('),')[0] + ')', width: '100%', height: '100%', borderRadius: '50%', border: '1px solid var(--border-strong)' }} />
          </div>
          <div>
            <div className="tl">{t.label}</div>
            <div className="ts">{t.desc}</div>
          </div>
          {key === active && <div className="tm"><Icon name="check" size={14} /></div>}
        </div>
      ))}
    </div>
  )
}
