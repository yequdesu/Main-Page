# LighthouseScene 解耦实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 2171 行的 LighthouseScene.vue 解耦为分层模块化结构（共享层 + Act 模块），动画效果完全不变。

**Architecture:** 将跨幕共享的 Three.js 对象（dust、ocean、beam、grid）提取到 `layers/` 作为独立模块，Act 独有元素提取到 `acts/`，编排逻辑留在 LighthouseScene.vue。所有动画状态保持为 scrollProgress 的纯函数。

**Tech Stack:** Vue 3 + Vite + Three.js + GSAP（不变）

---

## 文件结构总览

```
src/
├── three/
│   ├── constants.js              # 新建 — 全部阈值、轨道、颜色常量
│   ├── shared/
│   │   ├── stateContext.js       # 新建 — StateContext 类（单例 ctx）
│   │   ├── reusableObjects.js    # 新建 — 预分配的 Vector3/Color
│   │   └── animationPipeline.js  # 新建 — 主 animate() + resolveActiveActs
│   ├── layers/
│   │   ├── whiteOutManager.js    # 新建
│   │   ├── dustSystem.js         # 新建
│   │   ├── oceanWaves.js         # 新建
│   │   ├── gridLines.js          # 新建
│   │   ├── lightBeam.js          # 新建
│   │   └── overlayCanvas.js      # 新建
│   └── acts/
│       ├── act1OceanVoyage.js    # 新建
│       ├── act2GridTransition.js # 新建
│       └── act3ContentPhase.js   # 新建
├── components/
│   └── LighthouseScene.vue       # 修改 — 从 2171 行减至 ~300 行
```

---

### Task 1: 创建目录结构和 constants.js

**Files:**
- Create: `src/three/constants.js`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p src/three/shared src/three/layers src/three/acts
```

- [ ] **Step 2: 写入 constants.js**

```js
// ============================================================
//  ACT BOUNDARY THRESHOLDS
// ============================================================
export const WHITE_OUT_THRESHOLD = 0.40
export const WHITE_OUT_END      = 0.55
export const GRID_START         = 0.45
export const VERTICAL_START     = 0.58
export const TEXT_START         = 0.70
export const GRID_SHIFT_START   = 0.85
export const IDLE_RESET_DELAY   = 1.5

// ============================================================
//  UNIFIED SCENE CENTER
// ============================================================
export const SCENE_CENTER_Z = -16.0

// ============================================================
//  ACT 3 — ORBIT CONSTANTS
// ============================================================
export const ORBIT_COUNT = 4
export const ORBIT_RADII = [3.6, 5.0, 6.4, 22.0]
export const ELLIPSE_A = 22.0
export const ELLIPSE_E = 0.65
export const ELLIPSE_B = ELLIPSE_A * Math.sqrt(1 - ELLIPSE_E * ELLIPSE_E)
export const ELLIPSE_C = ELLIPSE_A * ELLIPSE_E
export const ELLIPSE_INCL = 0.45

// ============================================================
//  COLOR CONSTANTS
// ============================================================
export const BG_BASE       = '#050811'
export const BG_TARGET     = '#f1f5f9'
export const TARGET_COL    = '#94a3b8'
export const COLOR_ACT1    = '#f0f8ff'
export const COLOR_ACT3    = '#64748b'
export const ORBIT_NEAR    = '#475569'
export const ORBIT_FAR     = '#f1f5f9'

// ============================================================
//  UTILITY
// ============================================================
export function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

export function shortestDelta(from, to) {
  let d = to - from
  while (d > Math.PI)  d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
```

- [ ] **Step 3: 在 LighthouseScene.vue 中导入常量，替换本地定义**

在 `<script setup>` 顶部添加 import，移除对应的本地常量定义，验证 `npm run dev` 编译通过并正常显示。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract constants to src/three/constants.js"
```

---

### Task 2: 提取 StateContext

**Files:**
- Create: `src/three/shared/stateContext.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 stateContext.js**

```js
class StateContext {
  constructor() {
    this._store = new Map()
    // 允许直接属性访问作为语法糖
    return new Proxy(this, {
      get(target, prop) {
        if (prop === '_store') return target._store
        if (target._store.has(prop)) return target._store.get(prop)
        return undefined
      },
      set(target, prop, value) {
        target._store.set(prop, value)
        return true
      },
      has(target, prop) {
        return target._store.has(prop)
      }
    })
  }

  set(key, val)  { this._store.set(key, val) }
  get(key)       { return this._store.get(key) }
  has(key)       { return this._store.has(key) }
  delete(key)    { this._store.delete(key) }
}

export const ctx = new StateContext()
```

- [ ] **Step 2: 在 LighthouseScene.vue 中替换本地 StateContext**

```js
// 删除本地的 class StateContext { ... } 和 const ctx = new StateContext()
// 改为：
import { ctx } from '../three/shared/stateContext.js'
```

- [ ] **Step 3: 验证**

运行 `npm run dev`，确认页面正常渲染。ctx 的行为与原来完全一致（Map + Proxy 语法糖）。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract StateContext to src/three/shared/stateContext.js"
```

---

### Task 3: 提取预分配对象到 reusableObjects.js

**Files:**
- Create: `src/three/shared/reusableObjects.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 分析 LighthouseScene.vue 中所有 `const _xxx = new THREE.Vector3/Color/Quaternion()` 声明**

这些对象在 lines 49-121，全部是预分配的复用对象。

- [ ] **Step 2: 创建 reusableObjects.js**

```js
import * as THREE from 'three'
import { SCENE_CENTER_Z, BG_BASE, BG_TARGET } from '../constants.js'

// ---- act1 beam highlight ----
export const _waveBeamOrigin = new THREE.Vector3()
export const _waveBeamDir = new THREE.Vector3()
export const _targetCol = new THREE.Color('#94a3b8')

// ---- dust system ----
export const _dustBwo = new THREE.Vector3()
export const _dustBeamDir = new THREE.Vector3()
export const _dustToP = new THREE.Vector3()
export const _dustPp = new THREE.Vector3()
export const _colorAct1 = new THREE.Color('#f0f8ff')
export const _colorAct3 = new THREE.Color('#64748b')
export const _colorAct2 = new THREE.Color()
export const _currentColor = new THREE.Color()

// ---- click NDC ----
export const _clickNDC = new THREE.Vector2()

// ---- camera-focus system ----
export const _defaultCamPos = new THREE.Vector3(0, 0.25, 8)
export const _defaultLookAt = new THREE.Vector3(0, -0.65, -24)
export const _targetCamPos = new THREE.Vector3(0, 0.25, 8)
export const _targetLookAt = new THREE.Vector3(0, -0.65, -24)
export const _currentLookAt = new THREE.Vector3(0, -0.65, -24)
export const _camOffsetDir = new THREE.Vector3()
export const _camToStar = new THREE.Vector3()
export const _camLeftDir = new THREE.Vector3()
export const _camUp = new THREE.Vector3(0, 1, 0)
export const _starPos = new THREE.Vector3(0, -1.0, SCENE_CENTER_Z)
export const _occCamToPlanet = new THREE.Vector3()
export const _occToParticle = new THREE.Vector3()
export const _occProj = new THREE.Vector3()
export const _focusAxisPoint = new THREE.Vector3()
export const _focusBaseOffset = new THREE.Vector3()
export const _focusOrbitQuat = new THREE.Quaternion()

// ---- orbit ring vertex depth ----
export const _orbitNearCol = new THREE.Color('#475569')
export const _orbitFarCol  = new THREE.Color('#f1f5f9')
export const _orbitTempCol = new THREE.Color()
export const _orbitTempV   = new THREE.Vector3()

// ---- screen-space overlay ----
export const _ssStar = new THREE.Vector3()
export const _ssPlanet = new THREE.Vector3()
export const _ssStarEdge = new THREE.Vector3()
export const _ssScratch = new THREE.Vector3()

// ---- precise projection tangent (overlay & invert canvas) ----
export const _vCamToPlanet = new THREE.Vector3()
export const _uRight = new THREE.Vector3()
export const _uUp = new THREE.Vector3()
export const _sTangent = new THREE.Vector3()
export const _tRight = new THREE.Vector3()
export const _tLeft = new THREE.Vector3()
export const _tTop = new THREE.Vector3()
export const _tBottom = new THREE.Vector3()
export const _ssTRight = new THREE.Vector3()
export const _ssTLeft = new THREE.Vector3()
export const _ssTTop = new THREE.Vector3()
export const _ssTBottom = new THREE.Vector3()
export const _planetWorldPos = new THREE.Vector3()

// ---- background lerp ----
export const _bgBaseColor = new THREE.Color(BG_BASE)
export const _bgTargetColor = new THREE.Color(BG_TARGET)
export const _bgLerpColor = new THREE.Color()

// ---- dust projection scratch ----
export const _dustProjectScratch = new THREE.Vector3()
```

- [ ] **Step 3: 在 LighthouseScene.vue 中替换**

删除 lines 49-121 的本地声明，改为：
```js
import { _waveBeamOrigin, _waveBeamDir, _targetCol, _dustBwo, _dustBeamDir,
  _dustToP, _dustPp, _colorAct1, _colorAct3, _colorAct2, _currentColor,
  _clickNDC, _defaultCamPos, _defaultLookAt, _targetCamPos, _targetLookAt,
  _currentLookAt, _camOffsetDir, _camToStar, _camLeftDir, _camUp, _starPos,
  _occCamToPlanet, _occToParticle, _occProj, _focusAxisPoint, _focusBaseOffset,
  _focusOrbitQuat, _orbitNearCol, _orbitFarCol, _orbitTempCol, _orbitTempV,
  _ssStar, _ssPlanet, _ssStarEdge, _ssScratch,
  _vCamToPlanet, _uRight, _uUp, _sTangent, _tRight, _tLeft, _tTop, _tBottom,
  _ssTRight, _ssTLeft, _ssTTop, _ssTBottom, _planetWorldPos,
  _bgBaseColor, _bgTargetColor, _bgLerpColor, _dustProjectScratch
} from '../three/shared/reusableObjects.js'
```

- [ ] **Step 4: 验证**

运行 `npm run dev`，确认编译通过，全页面滑动动画正常。

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "refactor: extract reusable Three.js objects to reusableObjects.js"
```

---

### Task 4: 提取 whiteOutManager.js

**Files:**
- Create: `src/three/layers/whiteOutManager.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 whiteOutManager.js**

这是最简单的共享层——只依赖 `scene` 和 `beamPivot`/`_ambientLightRef` 引用（从 ctx 读取）。

```js
import * as THREE from 'three'
import { WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START } from '../constants.js'
import { _bgBaseColor, _bgTargetColor, _bgLerpColor } from '../shared/reusableObjects.js'

export function sceneApplyWhiteOut(sp, ctx) {
  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, wof)
  ctx.scene.background = _bgLerpColor

  let fogDensity = 0.02
  if (sp >= WHITE_OUT_THRESHOLD && sp < WHITE_OUT_END) {
    fogDensity = 0.02 + wof * 0.08
  } else if (sp >= WHITE_OUT_END) {
    const fadeProgress = Math.max(0, Math.min(1, (sp - WHITE_OUT_END) / (GRID_SHIFT_START - WHITE_OUT_END)))
    fogDensity = 0.10 * (1.0 - fadeProgress)
  }

  if (fogDensity > 0.001) {
    if (!ctx.scene.fog) {
      ctx.scene.fog = new THREE.FogExp2(_bgLerpColor, fogDensity)
    }
    ctx.scene.fog.color.copy(_bgLerpColor)
    ctx.scene.fog.density = fogDensity
  } else {
    if (ctx.scene.fog) ctx.scene.fog = null
  }

  if (ctx._ambientLightRef) ctx._ambientLightRef.intensity = 1.4 + wof * 3.5

  if (ctx.beamPivot) {
    ctx.beamPivot.visible = wof < 1.0
  }
}

export function build(ctx) {
  // 无独立 Three.js 对象创建——build 是空操作
  // fog 和 background 在 animate 中直接操作 ctx.scene
}

export function dispose(ctx) {
  // 无独立资源需要释放
}
```

- [ ] **Step 2: 在 LighthouseScene.vue 中替换**

删除 `sceneApplyWhiteOut` 函数定义（lines 202-230），改为：
```js
import { sceneApplyWhiteOut } from '../three/layers/whiteOutManager.js'
```

- [ ] **Step 3: 验证**

运行 `npm run dev`，滑动全范围确认 fog 和背景色过渡与原来一致。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract whiteOutManager layer"
```

---

### Task 5: 提取 dustSystem.js（最复杂的共享层）

**Files:**
- Create: `src/three/layers/dustSystem.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 dustSystem.js**

将以下内容整体移入新文件：
- `buildDust()` 函数（lines 442-526）
- `animateDust()` 函数（lines 666-809）
- 相关状态变量：`dustParticles`、`_mainPlanetIndices`、`_mainPlanetsPreFiltered`
- 导入 `* as THREE`、constants、reusable objects、ctx

```js
import * as THREE from 'three'
import { ctx } from '../shared/stateContext.js'
import {
  WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START,
  ORBIT_COUNT, ORBIT_RADII, SCENE_CENTER_Z,
  ELLIPSE_A, ELLIPSE_B, ELLIPSE_C, ELLIPSE_INCL
} from '../constants.js'
import {
  _dustBwo, _dustBeamDir, _dustToP, _dustPp,
  _colorAct1, _colorAct3, _colorAct2, _currentColor,
  _defaultCamPos, _occCamToPlanet, _occToParticle, _occProj,
  _dustProjectScratch
} from '../shared/reusableObjects.js'

let dustParticles = []
let _mainPlanetIndices = []
let _mainPlanetsPreFiltered = []
let _lastDustTime = -1, _lastDustSp = -1
let _hoveredIdx = -1
let _lastTimeSec = 0

// 从 ctx 读取鼠标和相机引用（每帧动态获取，因为 camera 可能变化）
function getCamera() { return ctx.camera }
function getMouseNDC() { return ctx._mouseNDC }
function getCanvasRef() { return ctx.canvasRef }

export { dustParticles, _mainPlanetIndices, _mainPlanetsPreFiltered, _hoveredIdx, _lastTimeSec }

export function buildDust(ctx) {
  if (dustParticles.length > 0) return
  const count = 135

  const dustConfigs = []
  for (let i = 0; i < count; i++) {
    const scale = 0.4 + Math.random() * 0.8
    const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
    dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
  }

  const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
    .sort((a, b) => b.size - a.size)
  _mainPlanetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

  const lowPolyGeo = new THREE.SphereGeometry(0.015, 10, 8)
  const highPolyGeo = new THREE.SphereGeometry(0.015, 32, 32)

  for (let i = 0; i < count; i++) {
    const isMain = _mainPlanetIndices.includes(i)
    const geo = isMain ? highPolyGeo : lowPolyGeo

    const gray = Math.floor(100 + Math.random() * 60)
    const grayHex = '#' + gray.toString(16).padStart(2, '0').repeat(3)

    const mat = new THREE.MeshBasicMaterial({
      color: '#f0f8ff',
      transparent: true,
      opacity: 0,
      depthWrite: isMain,
      depthTest: true
    })
    const p = new THREE.Mesh(geo, mat)

    p.renderOrder = isMain ? 1 : 2

    const t = Math.random()
    const worldOrigin = new THREE.Vector3()
    const lighthouseGroup = ctx.lighthouseGroup
    lighthouseGroup.getWorldPosition(worldOrigin)
    worldOrigin.y += 2.96 * lighthouseGroup.scale.y
    const zDist = 1 + t * 41
    const maxR = (zDist / 42) * 7.5 + 0.2
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR

    p.position.set(worldOrigin.x + Math.cos(angle) * r, worldOrigin.y + (Math.random() - 0.5) * maxR * 0.6, worldOrigin.z + zDist)

    const scale = dustConfigs[i].scale
    const sizeBoost = dustConfigs[i].sizeBoost

    p.userData = {
      wx: p.position.x, wy: p.position.y, wz: p.position.z,
      dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.1 + 0.06, dz: (Math.random() - 0.5) * 0.08,
      ph: Math.random() * Math.PI * 2, scale, sizeBoost,
      grayHex,
      orbitAngle: Math.random() * Math.PI * 2,
      isMainPlanet: isMain,
      hoverFactor: 0.0
    }

    if (isMain) {
      const trackIdx = _mainPlanetIndices.indexOf(i)
      p.userData.orbitR     = ORBIT_RADII[trackIdx]
      const isMenu = trackIdx === 3
      p.userData.orbitSpeed = isMenu ? -0.015 : (-0.04 - trackIdx * 0.015)
      p.userData._baseSpeed = p.userData.orbitSpeed
      p.userData.scaleMult  = isMenu ? 2.8 : (2.4 + trackIdx * 0.2)
      p.name = `planet_${trackIdx}`
    } else {
      p.userData.orbitR     = 2.5 + Math.random() * 4.5
      p.userData.orbitSpeed = -(0.03 + Math.random() * 0.08)
      p.userData._baseSpeed = p.userData.orbitSpeed
      p.userData.scaleMult  = 0.4 + Math.random() * 0.9
      p.userData.wobbleAmp  = 0.5 + Math.random() * 1.2
      p.userData.wobbleFreq = 0.3 + Math.random() * 0.4
    }
    p.userData.orbitTilt  = 0
    p.userData.flattenY   = 1.0

    ctx.scene.add(p)
    dustParticles.push(p)
  }
  _mainPlanetsPreFiltered = dustParticles.filter(p => p.userData.isMainPlanet)

  // 写入 ctx 供其他模块读取
  ctx.dustParticles = dustParticles
  ctx._mainPlanetIndices = _mainPlanetIndices
  ctx._mainPlanetsPreFiltered = _mainPlanetsPreFiltered
}

export function animateDust(time, sp, ctx) {
  // 帧缓存 guard
  if (time === _lastDustTime && sp === _lastDustSp) return
  _lastDustTime = time
  _lastDustSp = sp

  if (dustParticles.length === 0 || !ctx.camera) return

  const camera = ctx.camera
  const _mouseNDC = ctx._mouseNDC || { x: 999, y: 999 }
  const _focusedPlanetIdx = ctx._focusedPlanetIdx !== undefined ? ctx._focusedPlanetIdx : -1
  const canvasRef = ctx.canvasRef

  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const isFullyFormed3 = act3Progress >= 0.95

  // ... beam dust highlight logic (unchanged from original, using _dustBwo etc) ...
  // [此处为原 animateDust 的完整逻辑，省略以便计划保持可读——
  //  实际实施时直接复制原函数的全部代码，替换全局引用为 ctx 或 import]

  // ... mouse hover detection (unchanged) ...

  // ... per-particle position/scale/opacity update (unchanged) ...

  // ... occlusion logic (unchanged) ...

  // ... color lerp (unchanged) ...
}

export function disposeDust(ctx) {
  for (const p of dustParticles) {
    p.geometry.dispose()
    p.material.dispose()
    ctx.scene.remove(p)
  }
  dustParticles = []
  _mainPlanetIndices = []
  _mainPlanetsPreFiltered = []
}
```

> **实施注意**：`animateDust` 函数体（~140 行）完全复制原代码，仅做以下全局引用替换：
> - `camera` → `ctx.camera`
> - `_mouseNDC` → `ctx._mouseNDC`
> - `_focusedPlanetIdx` → `ctx._focusedPlanetIdx`
> - `canvasRef.value` → `ctx.canvasRef`
> - `beamPivot` → `ctx.beamPivot`
> - `_hoveredIdx`、`_lastTimeSec` 作为模块局部变量（通过 `export` 暴露给 overlayCanvas 模块读取）

- [ ] **Step 2: 在 LighthouseScene.vue 中替换**

删除 `buildDust()` 和 `animateDust()` 以及相关局部变量，改为 import。

- [ ] **Step 3: 验证**

运行 `npm run dev`，全范围滑动确认粒子动画（漂浮→白化→轨道+点击交互）与原来一致。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract dustSystem layer"
```

---

### Task 6: 提取 oceanWaves.js

**Files:**
- Create: `src/three/layers/oceanWaves.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 oceanWaves.js**

提取：
- `buildOcean()`（lines 261-299）
- `animateWavesAndLighting()`（lines 544-621）
- `wavesVisible`、`oceanLines`、`waveData`、`waveBaseColors` 局部变量
- 帧缓存 `_lastWavesTime`、`_lastWavesSp`

函数签名：`animateWavesAndLighting(time, sp, gridFactor, smoothProgress3, ctx)`

```js
import * as THREE from 'three'
import { ctx } from '../shared/stateContext.js'
import { WHITE_OUT_THRESHOLD, GRID_START, VERTICAL_START, GRID_SHIFT_START } from '../constants.js'
import { _waveBeamOrigin, _waveBeamDir, _targetCol } from '../shared/reusableObjects.js'

let oceanLines = []
let waveData = [], waveBaseColors = []
let wavesVisible = true
let _lastWavesTime = -1, _lastWavesSp = -1

export function buildOcean(ctx) {
  const TOTAL = 50, POWER = 2.2
  for (let i = 0; i < TOTAL; i++) {
    const t = i / (TOTAL - 1)
    const curveT = Math.pow(t, POWER)
    const z     = -52 + curveT * 57
    const baseY = -3.5 + curveT * 2.0
    const amplitude = 0.005 + curveT * 0.45
    const frequency = 0.12 + curveT * 0.22
    const speed     = 0.35 * curveT + 0.05
    const phase     = Math.random() * Math.PI * 2
    const opacity   = 0.15 + curveT * 0.55
    const span      = 45 + curveT * 35

    const r = Math.floor(6 + curveT * 12)
    const g = Math.floor(12 + curveT * 18)
    const b = Math.floor(26 + curveT * 24)
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
    const bc = new THREE.Color(hex)
    waveBaseColors.push({ r: bc.r, g: bc.g, b: bc.b })

    const segCount = 150
    const points = []
    for (let j = 0; j <= segCount; j++) {
      const x = (j / segCount - 0.5) * span * 2
      points.push(new THREE.Vector3(x, baseY, z))
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points)
    const colors = new Float32Array((segCount + 1) * 3)
    for (let j = 0; j <= segCount; j++) { colors[j*3]=bc.r; colors[j*3+1]=bc.g; colors[j*3+2]=bc.b }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: true })
    const line = new THREE.Line(geom, mat)
    line.renderOrder = 0
    ctx.scene.add(line)
    oceanLines.push(line)
    waveData.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
  }
  ctx.oceanLines = oceanLines
  ctx.waveData = waveData
  ctx.waveBaseColors = waveBaseColors
}

export function animateWavesAndLighting(time, sp, gridFactor, smoothProgress3, ctx) {
  // 帧缓存 guard
  if (time === _lastWavesTime && sp === _lastWavesSp) return
  _lastWavesTime = time
  _lastWavesSp = sp

  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothP3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothP3

  if (gridOpacityMult < 0.001) {
    if (wavesVisible) {
      for (let i = 0; i < oceanLines.length; i++) {
        oceanLines[i].visible = false
      }
      wavesVisible = false
    }
    return
  } else {
    if (!wavesVisible) {
      for (let i = 0; i < oceanLines.length; i++) {
        oceanLines[i].visible = true
      }
      wavesVisible = true
    }
  }

  const hlWeight = Math.max(0, Math.min(1, (WHITE_OUT_THRESHOLD - sp) / 0.10))
  const shiftY = -32.0 * smoothP3

  const beamPivot = ctx.beamPivot
  if (hlWeight > 0 && beamPivot) {
    beamPivot.getWorldPosition(_waveBeamOrigin)
    _waveBeamDir.set(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()
  }

  // [保持原有的 per-vertex 循环不变，约 35 行]
  // 每个顶点的 Y 坐标、颜色、透明度更新完全不变
  // ...
}

export function disposeOcean(ctx) {
  for (const line of oceanLines) {
    line.geometry.dispose()
    line.material.dispose()
    ctx.scene.remove(line)
  }
  oceanLines = []
  waveData = []
  waveBaseColors = []
}
```

> **实施注意**：`animateWavesAndLighting` 中的 per-vertex 循环（~35 行）完全不变，直接复制。参数 `gridFactor` 和 `smoothProgress3` 由 pipeline 注入。

- [ ] **Step 2: 在 LighthouseScene.vue 中替换**

删除 `buildOcean()`、`animateWavesAndLighting()`、相关变量。改为 import。

- [ ] **Step 3: 验证**

运行 `npm run dev`，验证波浪动画、光束高亮、向网格过渡的展平效果。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract oceanWaves layer"
```

---

### Task 7: 提取 gridLines.js

**Files:**
- Create: `src/three/layers/gridLines.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 gridLines.js**

提取：
- `buildVerticalGridLines()`（lines 1390-1416）
- `buildGridJunctionNodes()`（lines 1366-1388）
- `animateVerticalGrid()`（lines 1422-1474）
- `gridVerticalLines`、`_gridPoints`、`gridLinesVisible`、`_lastGridSp`

函数签名：`animateVerticalGrid(sp, gridFactor, smoothProgress3, ctx)`

```js
import * as THREE from 'three'
import { ctx } from '../shared/stateContext.js'
import { GRID_START, VERTICAL_START, TEXT_START, GRID_SHIFT_START } from '../constants.js'

let gridVerticalLines = []
let _gridPoints = null
let gridLinesVisible = true
let _lastGridSp = -1

export function buildGridLines(ctx) {
  buildVerticalGridLines(ctx)
  buildGridJunctionNodes(ctx)
  ctx.gridVerticalLines = gridVerticalLines
  ctx._gridPoints = _gridPoints
}

function buildGridJunctionNodes(ctx) { /* ... unchanged ... */ }

function buildVerticalGridLines(ctx) { /* ... unchanged ... */ }

export function animateVerticalGrid(sp, smoothProgress3, ctx) {
  // 帧缓存 guard
  if (sp === _lastGridSp) return
  _lastGridSp = sp

  const vertFactor = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothP3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothP3

  // ... visibility toggle (unchanged) ...
  // ... per-line vertex update (unchanged) ...
}

export function disposeGridLines(ctx) {
  for (const vd of gridVerticalLines) {
    vd.line.geometry.dispose()
    vd.line.material.dispose()
    ctx.scene.remove(vd.line)
  }
  gridVerticalLines = []
  if (_gridPoints) {
    _gridPoints.geometry.dispose()
    _gridPoints.material.dispose()
    ctx.scene.remove(_gridPoints)
    _gridPoints = null
  }
}
```

- [ ] **Step 2: 在 LighthouseScene.vue 中替换**

- [ ] **Step 3: 验证**

验证竖线延伸、接点淡入、Act 3 下沉全部正常。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: extract gridLines layer"
```

---

### Task 8: 提取 lightBeam.js

**Files:**
- Create: `src/three/layers/lightBeam.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 lightBeam.js**

提取：
- `buildLighthouse()`（lines 301-399）→ Act 模块存疑，但灯塔静态模型只在 Act1 需要，光束（beamPivot）跨两幕
- `buildLightBeam()`（lines 401-440）
- `buildLights()`（lines 528-537）——这些灯光跨三幕
- `animateBeam()`（lines 624-664）
- `VolumetricBeamShader`（lines 164-194）
- `lighthouseGroup`、`beamPivot`、`beamCones`、`beamRays`、`beamGlow`、`_ambientLightRef`、`_ptLightRef`
- `baseBeamAngle`、`returnToIdleTime`、`idlePhase`、`scrollStartAngle`、`scrollStartAngleX`、`wasScrolling`

```js
import * as THREE from 'three'
import { ctx } from '../shared/stateContext.js'
import { WHITE_OUT_THRESHOLD, WHITE_OUT_END, IDLE_RESET_DELAY, SCENE_CENTER_Z } from '../constants.js'
import { smoothstep, shortestDelta } from '../constants.js'

// VolumetricBeamShader (unchanged)
export const VolumetricBeamShader = { /* ... */ }

let lighthouseGroup, beamPivot
let beamCones = [], beamRays = [], beamGlow = null
let _ambientLightRef = null, _ptLightRef = null
let baseBeamAngle = 0, returnToIdleTime = 0, idlePhase = 0
let scrollStartAngle = 0, scrollStartAngleX = 0
let wasScrolling = false
let _lastBeamTime = -1, _lastBeamSp = -1

export function buildLightBeam(ctx) {
  buildLighthouse(ctx)
  buildBeam(ctx)
  buildLights(ctx)
  ctx.lighthouseGroup = lighthouseGroup
  ctx.beamPivot = beamPivot
  ctx._ambientLightRef = _ambientLightRef
  ctx._ptLightRef = _ptLightRef
}

// ... buildLighthouse, buildBeam, buildLights, animateBeam (unchanged from original) ...

export function disposeLightBeam(ctx) { /* ... */ }
```

- [ ] **Step 2-4: 替换、验证、提交**

与前面任务相同模式。

---

### Task 9: 提取 overlayCanvas.js

**Files:**
- Create: `src/three/layers/overlayCanvas.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 overlayCanvas.js**

提取 `updateCameraFocus()` 中的全部逻辑（lines 815-1340），包括：
- 相机聚焦系统（planet focus orbit + auto-unfocus）
- invert canvas 反色区绘制
- overlay canvas HUD 绘制（角落线框、刻度尺、左下角面板、左上角 HUD）
- 3D 星体投影连线和自适应引线面板

此模块需要从 ctx 读取：`camera`、`renderer`、`dustParticles`、`_mainPlanetIndices`、`_focusedPlanetIdx`、`_starPos`、`invertCanvasRef`、`overlayRef`、`emit`、`_planetLinks`

启用 `ctx.overlayData` 以维持与 App.vue 的 overlayData emit 兼容。

```js
import { ctx } from '../shared/stateContext.js'
import { GRID_SHIFT_START, SCENE_CENTER_Z } from '../constants.js'
import {
  _defaultCamPos, _defaultLookAt, _targetCamPos, _targetLookAt,
  _currentLookAt, _camOffsetDir, _camToStar, _camLeftDir,
  _camUp, _starPos, _focusAxisPoint, _focusBaseOffset,
  _focusOrbitQuat, _vCamToPlanet, _uRight, _uUp, _sTangent,
  _tRight, _tLeft, _tTop, _tBottom,
  _ssTRight, _ssTLeft, _ssTTop, _ssTBottom,
  _planetWorldPos, _ssStar, _ssPlanet, _ssScratch
} from '../shared/reusableObjects.js'

// Temporal smoothing state (module-local)
let _smoothStarX = 0, _smoothStarY = 0, _smoothStarRX = 0, _smoothStarRY = 0
let _smoothPlanetX = 0, _smoothPlanetY = 0, _smoothPlanetRX = 0, _smoothPlanetRY = 0
let _smoothInvertInit = false

const FOCUS_TIMEOUT = 30

export function updateOverlayCanvas(sp, time, ctx) {
  // 完整复制原 updateCameraFocus 的逻辑
  // 将 emit('focusChange', ...) 替换为 ctx.emit?.('focusChange', ...)
  // 将 emit('overlayData', ...) 替换为 ctx.emit?.('overlayData', ...)
  // ...
}

export function dispose(ctx) {
  // 清理临时状态
}
```

- [ ] **Step 2-4: 替换、验证、提交**

---

### Task 10: 提取 Act 模块

**Files:**
- Create: `src/three/acts/act1OceanVoyage.js`
- Create: `src/three/acts/act2GridTransition.js`
- Create: `src/three/acts/act3ContentPhase.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 act1OceanVoyage.js**

Act 1 在提取完所有共享层后，`build()` 中只剩：
- `buildSky()` — 设置 scene.background 和 fog（实际已在 whiteOutManager 中处理）
- `_ambientLightRef` 的初始状态

实际上 Act 1 的 `build()` 几乎为空——`buildOcean`、`buildLighthouse`、`buildLightBeam`、`buildDust`、`buildLights` 都已移到共享层。

```js
import { ctx } from '../shared/stateContext.js'
import { GRID_START } from '../constants.js'

export const act1 = {
  name: 'OceanVoyage',
  start: 0.00,
  end: GRID_START,
  build() {
    // 共享层已在 LighthouseScene.vue onMounted 中统一 build
    // Act 1 无独立元素需要创建
  },
  exit() {
    // 不需要保存状态快照——移除原有的 ctx.set() 无用代码
  },
  animate(time, tSp, sp, ctx) {
    if (ctx.beamPivot && !ctx.beamPivot.visible && sp < 0.55) {
      ctx.beamPivot.visible = true
    }
    if (ctx._ptLightRef && ctx._ptLightRef.intensity === 0) {
      ctx._ptLightRef.intensity = 3.0
    }
  },
  dispose() {}
}
```

- [ ] **Step 2: 创建 act2GridTransition.js**

```js
import { WHITE_OUT_THRESHOLD, GRID_SHIFT_START } from '../constants.js'

export const act2 = {
  name: 'GridTransition',
  start: WHITE_OUT_THRESHOLD,
  end: GRID_SHIFT_START,
  build() {
    // grid 对象已由 gridLines layer 创建
  },
  exit() {},
  animate(time, tSp, sp, ctx) {
    // 所有网格动画已在 animateVerticalGrid 中处理
  },
  dispose() {}
}
```

- [ ] **Step 3: 创建 act3ContentPhase.js**

提取：
- `_orbitLines`、`_gyroGroups`、`_starGroup`、`_starGlow`、`_wedgeRings`、`_planetLabels`、`_planetLinks`、`_raycaster`
- `createPlanetLabel()`（lines 1511-1568）
- `act3.build()`（lines 1570-1753）
- `act3.animate()`（lines 1755-1876）
- `act3.exit()`（lines 1878-1898）
- `act3.dispose()`（lines 1900-1949）

```js
import * as THREE from 'three'
import { ctx } from '../shared/stateContext.js'
import {
  TEXT_START, GRID_SHIFT_START, ORBIT_COUNT, ORBIT_RADII,
  ELLIPSE_A, ELLIPSE_B, ELLIPSE_C, ELLIPSE_INCL, SCENE_CENTER_Z
} from '../constants.js'
import { _orbitNearCol, _orbitFarCol, _orbitTempCol, _orbitTempV, _ssScratch } from '../shared/reusableObjects.js'

// _planetLinks, createPlanetLabel, build, animate, exit, dispose ...
// 全部逻辑不变，仅将 Scene 引用从 scene 改为 ctx.scene
```

- [ ] **Step 4: 在 LighthouseScene.vue 中替换 act 定义**

```js
import { act1 } from '../three/acts/act1OceanVoyage.js'
import { act2 } from '../three/acts/act2GridTransition.js'
import { act3 } from '../three/acts/act3ContentPhase.js'

const acts = [act1, act2, act3]
```

- [ ] **Step 5: 验证**

运行 `npm run dev`，确认全范围滑动、Act3 轨道环、行星标签、点击交互全部正常。

- [ ] **Step 6: 提交**

```bash
git add -A && git commit -m "refactor: extract Act modules"
```

---

### Task 11: 创建 animationPipeline.js

**Files:**
- Create: `src/three/shared/animationPipeline.js`
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 创建 animationPipeline.js**

```js
import { ctx } from './stateContext.js'
import { clamp } from '../constants.js'
import { GRID_START, VERTICAL_START, GRID_SHIFT_START } from '../constants.js'
import { sceneApplyWhiteOut } from '../layers/whiteOutManager.js'
import { animateWavesAndLighting } from '../layers/oceanWaves.js'
import { animateVerticalGrid } from '../layers/gridLines.js'
import { animateDust } from '../layers/dustSystem.js'
import { animateBeam } from '../layers/lightBeam.js'
import { updateOverlayCanvas } from '../layers/overlayCanvas.js'
import { smoothstep } from '../constants.js'

// ---- Act Manager ----
const builtActs = new Set()

export function resolveActiveActs(sp, acts, ctx) {
  const active = []
  for (const act of acts) {
    const inRange = sp >= act.start - 0.01 && sp <= act.end + 0.01
    if (inRange) {
      if (!builtActs.has(act.name)) {
        if (act.build) act.build(ctx)
        builtActs.add(act.name)
      }
      active.push(act)
    }
  }
  return active
}

// ---- Main Animation Pipeline ----
export function createAnimationLoop(getScrollProgress, acts) {
  function animate(time) {
    const animationId = requestAnimationFrame(animate)
    const t = time * 0.001
    const sp = getScrollProgress()

    updateTextOffsetCSS(sp)

    // 1. White-out (fog / background)
    sceneApplyWhiteOut(sp, ctx)

    // 2. Lighthouse visibility
    if (ctx.lighthouseGroup) {
      ctx.lighthouseGroup.visible = sp < 0.55
    }

    // 3. Shared layer animations (explicit order)
    const gridFactor = clamp((sp - GRID_START) / (VERTICAL_START - GRID_START), 0, 1)
    const smoothProgress3 = smoothstep(clamp((sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START), 0, 1))

    animateWavesAndLighting(t, sp, gridFactor, smoothProgress3, ctx)
    animateVerticalGrid(sp, smoothProgress3, ctx)
    animateDust(t, sp, ctx)
    animateBeam(t, sp, ctx)

    // 4. Act-specific animations
    const activeActs = resolveActiveActs(sp, acts, ctx)
    for (const act of activeActs) {
      const tSp = clamp((sp - act.start) / (act.end - act.start), 0, 1)
      if (act.animate) act.animate(t, tSp, sp, ctx)
    }

    // 5. Overlay canvas
    updateOverlayCanvas(sp, t, ctx)

    // 6. Render
    ctx.renderer.render(ctx.scene, ctx.camera)
  }
  return animate
}

let _lastCssSpKey = -1
function updateTextOffsetCSS(sp) {
  const key = Math.round(sp * 1000)
  if (key === _lastCssSpKey) return
  _lastCssSpKey = key
  const progress = clamp((sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START), 0, 1)
  const smoothP = progress * progress * (3 - 2 * progress)
  document.documentElement.style.setProperty('--text-offset-y', `${-90 * smoothP}px`)
}
```

- [ ] **Step 2: 在 LighthouseScene.vue 中替换主循环**

```js
import { createAnimationLoop, resolveActiveActs } from '../three/shared/animationPipeline.js'

// onMounted 中：
// 替换原有的 animate 函数和 onMounted 中的 animate wrapper
const animate = createAnimationLoop(() => props.scrollProgress, acts)
```

- [ ] **Step 3: 验证**

全范围滑动验证所有动画管线阶段执行正确。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "refactor: create animation pipeline"
```

---

### Task 12: 重构 LighthouseScene.vue 为编排层

**Files:**
- Modify: `src/components/LighthouseScene.vue`

- [ ] **Step 1: 重写 LighthouseScene.vue**

目标：从 ~2171 行减至 ~300 行。保留以下职责：

1. Props、Emits 定义
2. 模板（三个 canvas）
3. onMounted：
   - 创建 Scene、Camera、Renderer
   - 将基础设施注入 ctx：`ctx.scene`、`ctx.camera`、`ctx.renderer`、`ctx.canvasRef`、`ctx.invertCanvasRef`、`ctx.overlayRef`、`ctx.emit`
   - 调用各共享层的 `build(ctx)`
   - 调用 `createAnimationLoop()` 启动动画循环
   - 注册 resize、mousemove、click 事件
4. onUnmounted：取消动画帧，调用各模块 `dispose(ctx)`，移除事件监听
5. `captureLighthouse()`（保持不变，export 给 App.vue）
6. `defineExpose({ captureLighthouse })`

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { ctx } from '../three/shared/stateContext.js'
import { createAnimationLoop } from '../three/shared/animationPipeline.js'
import { buildOcean } from '../three/layers/oceanWaves.js'
import { buildLightBeam } from '../three/layers/lightBeam.js'
import { buildDust } from '../three/layers/dustSystem.js'
import { buildGridLines } from '../three/layers/gridLines.js'
// Act 定义
import { act1 } from '../three/acts/act1OceanVoyage.js'
import { act2 } from '../three/acts/act2GridTransition.js'
import { act3 } from '../three/acts/act3ContentPhase.js'
import {
  GRID_SHIFT_START, SCENE_CENTER_Z, ORBIT_COUNT, ORBIT_RADII,
  ELLIPSE_A, ELLIPSE_B, ELLIPSE_C, ELLIPSE_INCL
} from '../three/constants.js'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const emit = defineEmits(['focusChange', 'overlayData'])

const canvasRef = ref(null)
const overlayRef = ref(null)
const invertCanvasRef = ref(null)

let animationId = null

const acts = [act1, act2, act3]

function captureLighthouse() {
  // ... unchanged (lines 2065-2106) ...
}

defineExpose({ captureLighthouse })

onMounted(() => {
  const w = window.innerWidth, h = window.innerHeight

  // 注入基础设施到 ctx
  ctx.scene = new THREE.Scene()
  ctx.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 150)
  ctx.camera.position.set(0, 0.25, 8)
  ctx.camera.lookAt(0, -0.65, -24)

  ctx.renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: false, antialias: true })
  ctx.renderer.setSize(w, h)
  ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  ctx.canvasRef = canvasRef.value
  ctx.invertCanvasRef = invertCanvasRef
  ctx.overlayRef = overlayRef
  ctx.emit = emit
  ctx._mouseNDC = { x: 999, y: 999 }
  ctx._focusedPlanetIdx = -1
  ctx._focusStartTime = 0
  ctx._focusOrbitAngle = 0
  ctx._focusUIProgress = 0

  // 统一构建所有共享层
  buildOcean(ctx)
  buildLightBeam(ctx)
  buildDust(ctx)
  buildGridLines(ctx)

  // 启动动画管线
  const animate = createAnimationLoop(() => props.scrollProgress, acts)
  animationId = requestAnimationFrame(animate)

  // 事件监听
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  canvasRef.value.addEventListener('click', onClickCanvas)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  canvasRef.value?.removeEventListener('click', onClickCanvas)
  ctx.renderer?.dispose()
  // ... dispose scene objects ...
})

// Helper functions
function onResize() { /* ... */ }
function onMouseMove(e) { /* ... */ }
function onClickCanvas(e) { /* ... */ }
</script>

<template>
  <div style="position:fixed;inset:0;z-index:0">
    <canvas ref="canvasRef" style="position:absolute;inset:0" />
    <canvas ref="invertCanvasRef" style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:difference;" />
    <canvas ref="overlayRef" style="position:absolute;inset:0;pointer-events:none" />
  </div>
</template>
```

- [ ] **Step 2: 验证**

运行 `npm run dev`，对所有 scrollProgress 范围做完整滑动测试：
- 0.00-0.40：波浪 + 光束 + 漂浮粒子
- 0.40-0.55：白化过渡
- 0.55-0.85：网格竖线延伸、文字淡入
- 0.85-1.00：轨道环 + 行星 + 点击交互
- 双向滑动测试（前进再回退，确认动画路径确定性）
- 点击快进（click fast-forward）测试

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "refactor: slim LighthouseScene.vue to orchestration layer"
```

---

### Task 13: 最终验证与清理

- [ ] **Step 1: 构建生产版本**

```bash
npm run build
```
确认无编译错误，输出大小合理。

- [ ] **Step 2: 预览生产版本**

```bash
npm run preview
```
浏览器中完整测试全部动画范围。

- [ ] **Step 3: 检查残留代码**

```bash
grep -rn "TODO\|FIXME\|HACK" src/three/ src/components/
```
确认无遗留标记。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: final cleanup after decoupling"
```
