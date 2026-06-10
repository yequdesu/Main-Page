import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

// Register THREE.Line / THREE.LineLoop for declarative R3F usage
// threeLine avoids SVG <line> conflict; lineLoop is not auto-registered
extend({ ThreeLine, LineLoop })

// Global GSAP setup (from main.js)
gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(<App />)
