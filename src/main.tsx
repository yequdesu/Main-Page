import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

// Register non-standard THREE classes for declarative R3F usage
extend({ ThreeLine, LineLoop, InstancedMesh2 })

// Global GSAP setup (from main.js)
gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(<App />)
