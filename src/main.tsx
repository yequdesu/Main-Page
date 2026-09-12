import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

// 保存图标配置只刷新主页，保留 Debug Studio 的相机和未保存草稿。
if (import.meta.hot) {
  const reloadCapture = () => window.location.reload()
  import.meta.hot.on('lighthouse-config-updated', reloadCapture)
  import.meta.hot.dispose(() => import.meta.hot?.off('lighthouse-config-updated', reloadCapture))
}

// Register non-standard THREE classes for declarative R3F usage
extend({ ThreeLine, LineLoop, InstancedMesh2 })

// Global GSAP setup (from main.js)
gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(<App />)
