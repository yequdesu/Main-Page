# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server with HMR on port 5173 (binds 0.0.0.0)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

The dev server proxies `/api/*` → `http://127.0.0.1:9999` (strips `/api` prefix).

There are no tests or linters configured in this project.

## Architecture

This is a **single-page personal site** (no router) built with **Vue 3 + Vite + Three.js + GSAP**. The entire experience is a scroll-driven 3D scene rendered on a full-viewport `<canvas>`.

### Scroll-driven scene model

GSAP ScrollTrigger drives everything. The page body is stretched to `15 × viewport height` via JS (`SCROLL_VH = 15` in `App.vue`). A single `scrollProgress` value (0–1) is passed down to `LighthouseScene.vue` and drives all animation logic — there are no DOM-based scroll sections.

### Three.js scene structure (LighthouseScene.vue)

The scene is organized into three "Acts" that build/exit as `scrollProgress` crosses thresholds:

| Act | Range | What happens |
|-----|-------|--------------|
| Act 1 "OceanVoyage" | 0.00–0.45 | Dark ocean with animated wave lines, lighthouse with rotating light beam, 135 dust/particle objects |
| Act 2 "GridTransition" | 0.40–0.85 | White-out fog transition (background lerps from dark to light), vertical grid lines rise from the ocean, ocean waves flatten into grid |
| Act 3 "ContentPhase" | 0.85–1.00 | Grid descends, 3 orbit rings appear around the lighthouse, 3 main planets orbit on those rings with clickable labels (FS, Code, GitHub), gyroscope ring decorations spin |

Key thresholds (constants in `LighthouseScene.vue`):
- `WHITE_OUT_THRESHOLD = 0.40` — background/fog start transitioning to white
- `WHITE_OUT_END = 0.55` — white-out complete, fog begins fading
- `GRID_START = 0.45` — ocean waves start flattening into grid lines
- `VERTICAL_START = 0.58` — vertical grid lines begin extending
- `TEXT_START = 0.70` — brand text appears
- `GRID_SHIFT_START = 0.85` — everything shifts down, Act 3 orbits appear

Unified scene center Z is `SCENE_CENTER_Z = -16.0` — the lighthouse, orbits, and planets all align to this depth.

### Performance patterns

The code uses several deliberate performance optimizations:
- **Pre-allocated `THREE.Vector3`/`THREE.Color` objects** (prefixed `_`) reused across frames to avoid GC pressure
- **Frame caching guards** (`_lastWavesTime`, `_lastBeamTime`, etc.) — update functions bail out if called with the same `(time, scrollProgress)` pair within a single frame
- **Visibility toggles** — ocean lines and grid lines are bulk-hidden when their contribution is mathematically zero (opacity < 0.001), skipping per-vertex updates

### Particle system ("dust")

135 particles are created in Act 1. The 3 largest (by `totalSize` sort) become "main planets" with higher-poly geometry, depth write enabled, and `renderOrder = 1`. The rest are small `renderOrder = 2` particles. In Act 3, main planets transition to orbiting around `SCENE_CENTER_Z` and become clickable — clicking opens the associated URL in a new tab. Planet labels are Canvas-generated sprite textures (pill-shaped semi-transparent backgrounds with text).

### Component tree

```
App.vue
├── LighthouseScene.vue  (entire Three.js scene, receives scrollProgress prop)
├── scroll hint overlay  (visibility driven by scrollProgress)
├── brand text overlay   (visibility driven by scrollProgress)
└── AppFooter.vue        (static footer with ICP备案 link)
```

`App.vue` owns the scroll trigger, computes `scrollProgress`, and passes it as a prop. `LighthouseScene.vue` owns all Three.js objects, the animation loop, and all act management.

### Backend stats server

`stats_server.py` runs on `127.0.0.1:9999` and serves system metrics (CPU, memory, disk, load, uptime, Docker containers) as JSON at `/stats`. It reads from `/proc/*` and runs `docker ps`. It is NOT a Python project dependency — it's a standalone companion process for the `/api/stats` endpoint.

### Nginx configs

- `mainpage.nginx.dev.conf` — proxies all `/` traffic to Vite dev server on `:5173`, `/api/stats` to Python backend
- `mainpage.nginx.prod.conf` — serves static `dist/` with SPA fallback (`try_files $uri /index.html`), `/api/stats` to Python backend
- `mainpage.nginx.conf` — serves the project root directly (no build step, no dev proxy), `/api/stats` to Python backend

### Dependencies

- **three** (`^0.170.0`) — 3D rendering
- **gsap** (`^3.12.5`) — scroll-driven animation via ScrollTrigger plugin
- **vue** (`^3.5.13`) — UI framework
- **vite** (`^6.0.0`) + **@vitejs/plugin-vue** — build tooling
