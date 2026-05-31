import { createApp } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App.vue'
import './styles/main.css'

gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

const app = createApp(App)
app.mount('#app')
