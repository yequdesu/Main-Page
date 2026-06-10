import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

// Global GSAP setup (from main.js)
gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
