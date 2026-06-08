# YeQu Main Page

Personal landing page — scroll-driven Three.js 3D scene with a lighthouse, ocean waves, and orbiting planets. Built with **Vue 3 + Vite + Three.js + GSAP ScrollTrigger**.

## Quick Start

```bash
npm install
npm run dev        # → http://localhost:5173, hot reload
npm run build      # → dist/
npm run preview    # preview production build locally
```

The dev server proxies `/api/*` → `http://127.0.0.1:9999` (strips `/api` prefix).

## Project Structure

```
src/
├── App.vue                          # Scroll driver (GSAP ScrollTrigger → scrollProgress)
├── components/
│   ├── LighthouseScene.vue           # Orchestration layer (~200 lines)
│   └── AppFooter.vue
├── three/
│   ├── constants.js                  # Thresholds, orbit radii, colors, utilities
│   ├── shared/
│   │   ├── stateContext.js           # ctx singleton (shared namespace for all modules)
│   │   ├── reusableObjects.js        # Pre-allocated Vector3/Color for GC-free animation
│   │   └── animationPipeline.js      # Main animate() — explicit call order + act manager
│   ├── layers/                       # Cross-act shared systems (build → animate → dispose)
│   │   ├── whiteOutManager.js        # Fog / background color transitions
│   │   ├── oceanWaves.js             # Ocean wave lines (Act 1 → flatten → Act 3 descend)
│   │   ├── lightBeam.js              # Lighthouse model + volumetric beam + lights
│   │   ├── dustSystem.js             # 135 particles (float → white-out → orbit)
│   │   ├── gridLines.js              # Vertical grid lines + junction nodes (Act 2 → 3)
│   │   └── overlayCanvas.js          # Camera focus + invert canvas + HUD overlay
│   └── acts/                         # Act-specific 3D objects (build on enter, exit on leave)
│       ├── act1OceanVoyage.js        # Trivial (elements moved to layers/)
│       ├── act2GridTransition.js     # Trivial (elements moved to layers/)
│       └── act3ContentPhase.js       # Orbit rings, gyro rings, star, wedge rings, labels
└── styles/main.css
```

### How the modules communicate

All modules import `ctx` from `stateContext.js` — a single shared namespace (Map + Proxy). `LighthouseScene.vue` injects `scene`, `camera`, `renderer`, Vue refs, and state into `ctx` on mount. Each layer/act reads and writes via `ctx`, never importing each other directly.

### Animation pipeline (animationPipeline.js)

The main loop calls animation functions in fixed order — no abstraction layer:

1. `sceneApplyWhiteOut(sp)` — fog/background
2. `animateWavesAndLighting(t, sp, gridFactor, smoothProgress3)` — ocean → grid transition
3. `animateVerticalGrid(sp, smoothProgress3)` — grid lines
4. `animateDust(t, sp)` — particles
5. `animateBeam(t, sp)` — lighthouse beam
6. Act-specific `animate()` — orbit rings, gyro, star, labels
7. `updateOverlayCanvas(sp, t)` — camera focus + HUD + invert
8. `renderer.render(scene, camera)`

Shared progress variables (`gridFactor`, `smoothProgress3`) are computed once in the pipeline and injected into layers — layers never compute them independently or read them from each other. Every animation state is a pure function of `scrollProgress`, guaranteeing deterministic bidirectional scrolling.

## Three-Act Scene Structure

The page body is stretched to `15 × viewport height`. A single `scrollProgress` value (0–1) drives all animation:

| Act | Range | What happens |
|-----|-------|--------------|
| 1 — OceanVoyage | 0.00–0.45 | Dark ocean with animated wave lines, lighthouse with rotating beam, 135 floating particles |
| 2 — GridTransition | 0.40–0.85 | Background transitions to white, fog fades, ocean waves flatten into horizontal grid lines, vertical grid lines rise, brand text appears |
| 3 — ContentPhase | 0.85–1.00 | Grid descends, star appears, 3 orbit rings + 1 elliptical orbit appear, 4 planets orbit with clickable labels (FS, Code, GitHub, Menu), gyroscope ring decorations spin, camera focus system activates on planet click |

Key thresholds (in `src/three/constants.js`):

| Constant | Value | Meaning |
|----------|-------|---------|
| `WHITE_OUT_THRESHOLD` | 0.40 | Background/fog start whitening |
| `WHITE_OUT_END` | 0.55 | White-out complete, fog begins fading |
| `GRID_START` | 0.45 | Ocean waves start flattening into grid |
| `VERTICAL_START` | 0.58 | Vertical grid lines begin extending |
| `TEXT_START` | 0.70 | Brand text + star begin fading in |
| `GRID_SHIFT_START` | 0.85 | Everything shifts down, orbit rings and planets appear |

## Deployment

### Production (nginx)

```bash
# 1. Build
npm run build

# 2. Nginx config: mainpage.nginx.prod.conf
#    Serves dist/ with SPA fallback
#    Proxies /api/stats → stats_server.py on :9999

sudo cp mainpage.nginx.prod.conf /etc/nginx/sites-available/mainpage
sudo ln -s /etc/nginx/sites-available/mainpage /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### Stats server

```bash
# System metrics endpoint at /api/stats → /stats (internal)
python3 stats_server.py &
# Listens on 127.0.0.1:9999
```
