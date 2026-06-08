<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const emit = defineEmits(['focusChange', 'overlayData'])

const canvasRef = ref(null)
const overlayRef = ref(null)
const invertCanvasRef = ref(null)

// ============================================================
//  GLOBALS — shared by all acts, owned by the scene manager
// ============================================================
let renderer, scene, camera, animationId

// ============================================================
//  SHARED CONSTANTS — act boundary thresholds & unified center
// ============================================================
const WHITE_OUT_THRESHOLD = 0.40 
const WHITE_OUT_END      = 0.55 
const GRID_START         = 0.45 
const VERTICAL_START     = 0.58 
const TEXT_START         = 0.70 
const GRID_SHIFT_START   = 0.85 
const IDLE_RESET_DELAY   = 1.5

// 统一的场景中心 Z 轴坐标，使灯塔与轨道合理契合
const SCENE_CENTER_Z      = -16.0 

// ============================================================
//  ACT 3 CONSTANTS
// ============================================================
const ORBIT_COUNT = 4
const ORBIT_RADII = [3.6, 5.0, 6.4, 22.0]
// Elliptical orbit for 4th (menu) planet
const ELLIPSE_A = 22.0, ELLIPSE_E = 0.65
const ELLIPSE_B = ELLIPSE_A * Math.sqrt(1 - ELLIPSE_E * ELLIPSE_E)
const ELLIPSE_C = ELLIPSE_A * ELLIPSE_E
const ELLIPSE_INCL = 0.45
let _mainPlanetIndices = []

// ============================================================
//  PRE-ALLOCATED REUSABLE OBJECTS (GC-FREE)
// ============================================================
const _waveBeamOrigin = new THREE.Vector3()
const _waveBeamDir = new THREE.Vector3()
const _targetCol = new THREE.Color('#94a3b8')

const _dustBwo = new THREE.Vector3()
const _dustBeamDir = new THREE.Vector3()
const _dustToP = new THREE.Vector3()
const _dustPp = new THREE.Vector3()
const _colorAct1 = new THREE.Color('#f0f8ff')
const _colorAct3 = new THREE.Color('#64748b')
const _colorAct2 = new THREE.Color()
const _currentColor = new THREE.Color()

const _clickNDC = new THREE.Vector2()

// ---- camera-focus system pre-allocated ----
const _defaultCamPos = new THREE.Vector3(0, 0.25, 8)
const _defaultLookAt = new THREE.Vector3(0, -0.65, -24)
const _targetCamPos = new THREE.Vector3(0, 0.25, 8)
const _targetLookAt = new THREE.Vector3(0, -0.65, -24)
const _currentLookAt = new THREE.Vector3(0, -0.65, -24)
const _camOffsetDir = new THREE.Vector3()
const _camToStar = new THREE.Vector3()
const _camLeftDir = new THREE.Vector3()
const _camUp = new THREE.Vector3(0, 1, 0)
const _starPos = new THREE.Vector3(0, -1.0, SCENE_CENTER_Z)
const _occCamToPlanet = new THREE.Vector3()
const _occToParticle = new THREE.Vector3()
const _occProj = new THREE.Vector3()
const _focusAxisPoint = new THREE.Vector3()
const _focusBaseOffset = new THREE.Vector3()
const _focusOrbitQuat = new THREE.Quaternion()
let _focusStartTime = 0
let _focusOrbitAngle = 0
let _focusUIProgress = 0 // 动态 UI 插值进度

// Temporal smoothing for inversion region stability (prevents flicker during camera move)
let _smoothStarX = 0, _smoothStarY = 0, _smoothStarRX = 0, _smoothStarRY = 0
let _smoothPlanetX = 0, _smoothPlanetY = 0, _smoothPlanetRX = 0, _smoothPlanetRY = 0
let _smoothInvertInit = false

// ---- 第三幕环线顶点级深度暗示复用变量 ----
const _orbitNearCol = new THREE.Color('#475569')
const _orbitFarCol  = new THREE.Color('#f1f5f9')
const _orbitTempCol = new THREE.Color()
const _orbitTempV   = new THREE.Vector3()

// Scratch for screen-space overlay projection
const _ssStar = new THREE.Vector3()
const _ssPlanet = new THREE.Vector3()
const _ssStarEdge = new THREE.Vector3()
const _ssScratch = new THREE.Vector3()

// ---- 几何切线与 HUD 精密投影专用的复用对象 (GC-Free) ----
const _vCamToPlanet = new THREE.Vector3()
const _uRight = new THREE.Vector3()
const _uUp = new THREE.Vector3()
const _sTangent = new THREE.Vector3()
const _tRight = new THREE.Vector3()
const _tLeft = new THREE.Vector3()
const _tTop = new THREE.Vector3()
const _tBottom = new THREE.Vector3()
const _ssTRight = new THREE.Vector3()
const _ssTLeft = new THREE.Vector3()
const _ssTTop = new THREE.Vector3()
const _ssTBottom = new THREE.Vector3()
const _planetWorldPos = new THREE.Vector3()

// ---- pre-allocated reusable objects for hot paths ----
const _bgBaseColor = new THREE.Color('#050811')
const _bgTargetColor = new THREE.Color('#f1f5f9')
const _bgLerpColor = new THREE.Color()
const _dustProjectScratch = new THREE.Vector3()
let _mainPlanetsPreFiltered = []

// ============================================================
//  FRAME CACHING GUARDS
// ============================================================
let _lastWavesTime = -1, _lastWavesSp = -1
let _lastGridSp = -1
let _lastDustTime = -1, _lastDustSp = -1
let _lastBeamTime = -1, _lastBeamSp = -1

let wavesVisible = true
let gridLinesVisible = true

// ============================================================
//  UTILITY
// ============================================================
function shortestDelta(from, to) {
  let d = to - from
  while (d > Math.PI)  d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// ============================================================
//  STATE CONTEXT
// ============================================================
class StateContext {
  constructor() { this._store = new Map() }
  set(key, val)  { this._store.set(key, val) }
  get(key)       { return this._store.get(key) }
  has(key)       { return this._store.has(key) }
}

const ctx = new StateContext()

// ============================================================
//  VOLUMETRIC BEAM SHADER
// ============================================================
const VolumetricBeamShader = {
  uniforms: {
    uColor:     { value: new THREE.Color('#ffffff') },
    uOpacity:   { value: 0.4 },
    uLength:    { value: 30.0 },
    uEdgePower: { value: 2.0 }
  },
  vertexShader: `
    varying vec3 vNormal, vViewPosition, vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      vPosition = position;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal, vViewPosition, vPosition;
    uniform vec3 uColor;
    uniform float uOpacity, uLength, uEdgePower;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float edgeIntensity = pow(abs(dot(normal, viewDir)), uEdgePower);
      edgeIntensity = 0.25 + edgeIntensity * 0.75;
      float lengthFade = pow(clamp(1.0 - (abs(vPosition.y) / uLength), 0.0, 1.0), 1.5);
      gl_FragColor = vec4(uColor, edgeIntensity * lengthFade * uOpacity);
    }
  `
}

// ============================================================
//  SCENE MANAGER — white-out transition
// ============================================================
let _ambientLightRef = null
let _ptLightRef = null

function sceneApplyWhiteOut(sp) {
  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, wof)
  scene.background = _bgLerpColor

  let fogDensity = 0.02
  if (sp >= WHITE_OUT_THRESHOLD && sp < WHITE_OUT_END) {
    fogDensity = 0.02 + wof * 0.08
  } else if (sp >= WHITE_OUT_END) {
    const fadeProgress = Math.max(0, Math.min(1, (sp - WHITE_OUT_END) / (GRID_SHIFT_START - WHITE_OUT_END)))
    fogDensity = 0.10 * (1.0 - fadeProgress)
  }

  if (fogDensity > 0.001) {
    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(_bgLerpColor, fogDensity)
    }
    scene.fog.color.copy(_bgLerpColor)
    scene.fog.density = fogDensity
  } else {
    if (scene.fog) scene.fog = null
  }
  
  if (_ambientLightRef) _ambientLightRef.intensity = 1.4 + wof * 3.5

  if (beamPivot) {
    beamPivot.visible = wof < 1.0
  }
}

// ============================================================
//  ACT 1  OCEAN VOYAGE
// ============================================================
const act1 = { name: 'OceanVoyage', start: 0.00, end: GRID_START }

let lighthouseGroup, beamPivot
let beamCones = [], beamRays = [], beamGlow = null
let oceanLines = []
let waveData = [], waveBaseColors = []
let dustParticles = []

let baseBeamAngle = 0, returnToIdleTime = 0, idlePhase = 0
let scrollStartAngle = 0, scrollStartAngleX = 0
let wasScrolling = false

act1.build = () => {
  buildSky()
  buildOcean()
  buildLighthouse()
  buildLightBeam()
  buildDust()
  buildLights()
}

function buildSky() {
  scene.background = new THREE.Color('#050811')
  scene.fog = new THREE.FogExp2('#050811', 0.02)
}

function buildOcean() {
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
    scene.add(line)
    oceanLines.push(line)
    waveData.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
  }
}

function buildLighthouse() {
  lighthouseGroup = new THREE.Group()
  const metalMat  = new THREE.MeshStandardMaterial({ color:'#1b1f26', roughness:0.4, metalness:0.8 })
  const stoneMat  = new THREE.MeshStandardMaterial({ color:'#40454f', roughness:0.9 })
  const darkStone = new THREE.MeshStandardMaterial({ color:'#252930', roughness:0.8 })
  const glowMat   = new THREE.MeshBasicMaterial({ color:'#ffdf6d' })
  const winFrame  = new THREE.MeshBasicMaterial({ color:'#111317' })

  const found = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,1.4,16), darkStone)
  found.position.y = -0.9; lighthouseGroup.add(found)

  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.75,1.3,1.6,16),
    new THREE.MeshBasicMaterial({ color:'#050811', transparent:true, opacity:0.88, depthWrite:false }))
  shroud.position.y = -0.95; lighthouseGroup.add(shroud)

  const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.65,0.4,16), stoneMat)
  rock.position.y = -0.1; lighthouseGroup.add(rock)

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.55,0.12,16), darkStone)
  ring.position.y = 0.12; lighthouseGroup.add(ring)

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.30,2.6,20),
    new THREE.MeshStandardMaterial({ color:'#4d535c', roughness:0.5, metalness:0.1 }))
  body.position.y = 1.3; lighthouseGroup.add(body)

  const bandMat = new THREE.MeshStandardMaterial({ color:'#7a828f', roughness:0.6 })
  ;[{y:0.6,r:0.27},{y:1.8,r:0.22}].forEach(b=>{
    const band = new THREE.Mesh(new THREE.TorusGeometry(b.r,0.022,8,20), bandMat)
    band.rotation.x = Math.PI/2; band.position.y = b.y; lighthouseGroup.add(band)
  })

  ;[{y:1.0,ry:0.5,z:0.24},{y:1.9,ry:-0.8,z:0.19}].forEach(wc=>{
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.12,0.05), winFrame))
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04,0.10,0.055), glowMat))
    g.position.set(0,wc.y,wc.z); g.rotation.y=wc.ry; lighthouseGroup.add(g)
  })

  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.22,0.12,16), darkStone)
  balcony.position.y=2.6; lighthouseGroup.add(balcony)
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.03,16), metalMat)
  deck.position.y=2.67; lighthouseGroup.add(deck)

  const railG = new THREE.Group(); railG.position.y=2.68
  const hr = new THREE.Mesh(new THREE.TorusGeometry(0.33,0.008,6,24), metalMat)
  hr.rotation.x=Math.PI/2; hr.position.y=0.15; railG.add(hr)
  
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.15,6), metalMat)
    post.position.set(Math.cos(a)*0.33, 0.075, Math.sin(a)*0.33)
    railG.add(post)
  }
  lighthouseGroup.add(railG)

  const lf = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.06,16), metalMat)
  lf.position.y=2.74; lighthouseGroup.add(lf)

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.21,0.44,16,1,true),
    new THREE.MeshStandardMaterial({ color:'#fff', roughness:0.1, metalness:0.9,
      emissive:'#fff', emissiveIntensity:1.0, side:THREE.DoubleSide, transparent:true, opacity:0.2 }))
  glass.position.y=2.96; lighthouseGroup.add(glass)

  const bulbGlow = new THREE.MeshBasicMaterial({ color:'#ffdf6d', transparent:true, opacity:0.55, depthWrite:false })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07,12,12), bulbGlow)
  bulb.position.y=2.96; lighthouseGroup.add(bulb)

  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.44,6), metalMat)
    frame.position.set(Math.cos(a)*0.22, 2.96, Math.sin(a)*0.22)
    lighthouseGroup.add(frame)
  }

  const roofPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.04,16), metalMat)
  roofPlate.position.set(0,3.18,0)
  lighthouseGroup.add(roofPlate)

  const roofDome = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12,0,Math.PI*2,0,Math.PI/2), metalMat)
  roofDome.position.set(0,3.20,0)
  lighthouseGroup.add(roofDome)

  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.06,12), metalMat)
  spireBase.position.set(0,3.42,0)
  lighthouseGroup.add(spireBase)

  const brass = new THREE.MeshStandardMaterial({ color:'#e5c158', roughness:0.2, metalness:0.9 })
  const brassBall = new THREE.Mesh(new THREE.SphereGeometry(0.035,12,12), brass)
  brassBall.position.set(0,3.47,0)
  lighthouseGroup.add(brassBall)

  const spireTip = new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.012,0.35,8), metalMat)
  spireTip.position.set(0,3.65,0)
  lighthouseGroup.add(spireTip)

  lighthouseGroup.position.set(0,-2.5,SCENE_CENTER_Z)
  lighthouseGroup.scale.setScalar(0.7)
  scene.add(lighthouseGroup)
}

function buildLightBeam() {
  beamPivot = new THREE.Group()
  beamPivot.position.copy(lighthouseGroup.position)
  beamPivot.position.y += 2.96 * lighthouseGroup.scale.y
  scene.add(beamPivot)

  const configs = [
    { radius:0.5,  length:28, opacity:0.85, power:4.0 },
    { radius:1.8,  length:32, opacity:0.45, power:2.5 },
    { radius:4.8,  length:36, opacity:0.15, power:1.5 }
  ]
  configs.forEach(cfg=>{
    const geo = new THREE.ConeGeometry(cfg.radius, cfg.length, 32, 1, true)
    geo.translate(0, -cfg.length/2, 0)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor:{value:new THREE.Color('#f0f7ff')}, uOpacity:{value:cfg.opacity}, uLength:{value:cfg.length}, uEdgePower:{value:cfg.power} },
      vertexShader: VolumetricBeamShader.vertexShader,
      fragmentShader: VolumetricBeamShader.fragmentShader,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    })
    const cone = new THREE.Mesh(geo, mat); cone.rotation.x=-Math.PI/2
    cone.renderOrder = 0
    beamPivot.add(cone); beamCones.push(cone)
  })

  function makeRay(dx) {
    const pts=[new THREE.Vector3(0,0,0), new THREE.Vector3(dx*4.5,0,55)]
    const g=new THREE.BufferGeometry().setFromPoints(pts)
    g.setAttribute('color',new THREE.BufferAttribute(new Float32Array([1,1,1,0.3,0.3,0.3]),3))
    const rayLine = new THREE.Line(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.45,depthWrite:false,blending:THREE.AdditiveBlending}))
    rayLine.renderOrder = 0
    return rayLine
  }
  beamPivot.add(makeRay(-1)); beamPivot.add(makeRay(1))
  beamRays.push(beamPivot.children[beamPivot.children.length-2], beamPivot.children[beamPivot.children.length-1])

  beamGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,16), new THREE.MeshBasicMaterial({color:'#fff',transparent:true,opacity:0.95}))
  beamGlow.renderOrder = 0
  beamPivot.add(beamGlow)
}

function buildDust() {
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
    const grayHex = '#' + gray.toString(16).padStart(2,'0').repeat(3)
    
    const mat = new THREE.MeshBasicMaterial({ 
      color:'#f0f8ff', 
      transparent:true, 
      opacity:0, 
      depthWrite: isMain, 
      depthTest:true 
    })
    const p = new THREE.Mesh(geo, mat)
    
    p.renderOrder = isMain ? 1 : 2
    
    const t = Math.random()
    const worldOrigin = new THREE.Vector3()
    lighthouseGroup.getWorldPosition(worldOrigin)
    worldOrigin.y += 2.96 * lighthouseGroup.scale.y
    const zDist = 1 + t * 41
    const maxR = (zDist / 42) * 7.5 + 0.2
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR
    
    p.position.set(worldOrigin.x+Math.cos(angle)*r, worldOrigin.y+(Math.random()-0.5)*maxR*0.6, worldOrigin.z+zDist)
    
    const scale = dustConfigs[i].scale
    const sizeBoost = dustConfigs[i].sizeBoost
    
    p.userData = {
      wx:p.position.x, wy:p.position.y, wz:p.position.z,
      dx:(Math.random()-0.5)*0.15, dy:(Math.random()-0.5)*0.1+0.06, dz:(Math.random()-0.5)*0.08,
      ph:Math.random()*Math.PI*2, scale, sizeBoost,
      grayHex,
      orbitAngle: Math.random() * Math.PI * 2,
      isMainPlanet: isMain,
      hoverFactor: 0.0 
    }

    if (isMain) {
      const trackIdx = _mainPlanetIndices.indexOf(i)
      p.userData.orbitR     = ORBIT_RADII[trackIdx]
      // 4th planet (menu): smaller, slower, distant orbit
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
    
    scene.add(p)
    dustParticles.push(p)
  }
  _mainPlanetsPreFiltered = dustParticles.filter(p => p.userData.isMainPlanet)
}

function buildLights() {
  _ambientLightRef = new THREE.AmbientLight('#222d3d', 1.4)
  scene.add(_ambientLightRef)
  const dir = new THREE.DirectionalLight('#aed2ff', 1.8); dir.position.set(15,10,-10); scene.add(dir)
  const sky = new THREE.DirectionalLight('#ffffff', 0.5); sky.position.set(-15,12,-35); scene.add(sky)
  _ptLightRef = new THREE.PointLight('#ffffff', 3.0, 15, 1.0)
  _ptLightRef.position.copy(lighthouseGroup.position)
  _ptLightRef.position.y += 2.96 * lighthouseGroup.scale.y
  scene.add(_ptLightRef)
}

act1.animate = (time, tSp, sp) => {
  if (beamPivot && !beamPivot.visible && sp < WHITE_OUT_END) beamPivot.visible = true
  if (_ptLightRef && _ptLightRef.intensity === 0) _ptLightRef.intensity = 3.0
}

function animateWavesAndLighting(time, sp) {
  if (time === _lastWavesTime && sp === _lastWavesSp) return
  _lastWavesTime = time
  _lastWavesSp = sp

  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothProgress3

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
  const gridFactor = Math.max(0, Math.min(1, (sp - GRID_START) / (VERTICAL_START - GRID_START)))
  const shiftY = -32.0 * smoothProgress3

  if (hlWeight > 0 && beamPivot) {
    beamPivot.getWorldPosition(_waveBeamOrigin)
    _waveBeamDir.set(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()
  }
  
  for (let i = 0; i < oceanLines.length; i++) {
    const line = oceanLines[i], data = waveData[i], bc = waveBaseColors[i]
    const pa = line.geometry.attributes.position, ca = line.geometry.attributes.color
    const pArr = pa.array, cArr = ca.array
    
    const rawZ = data.z 
    const baseDepthFade = Math.max(0, Math.min(1, (rawZ - (-52)) / 20.0)) 
    
    for (let j = 0; j <= data.segCount; j++) {
      const idx = j*3, x = pArr[idx]
      const t = time * data.speed + data.phase
      const waveY = data.baseY + Math.sin(x*data.frequency+t)*data.amplitude + Math.sin(x*data.frequency*1.8+t*1.2)*data.amplitude*0.4
      
      pArr[idx+1] = THREE.MathUtils.lerp(waveY, data.baseY, gridFactor) + shiftY
      
      let r = bc.r, g = bc.g, b = bc.b
      if (hlWeight > 0 && beamPivot) {
        const vx = x - _waveBeamOrigin.x
        const vy = waveY - _waveBeamOrigin.y
        const vz = data.z - _waveBeamOrigin.z
        const proj = vx * _waveBeamDir.x + vy * _waveBeamDir.y + vz * _waveBeamDir.z
        const localX = vx * _waveBeamDir.z - vz * _waveBeamDir.x
        const beamR = 1.2 + Math.max(0, proj) * 0.15
        const distSq = (localX * localX) / (beamR * beamR) + (vy * vy) / 1.5
        let di = Math.exp(-distSq * 0.9)
        di *= Math.max(0, Math.min(1, (proj + 4) / 8))
        di *= Math.max(0, 1 - (Math.max(0, proj) / 48))
        let li = di * 1.5 * hlWeight
        if (_waveBeamDir.z > 0 && vz > 0) li += di * Math.exp(-(x * x) / 7) * _waveBeamDir.z * 1.3 * hlWeight
        const hR = 0.92, hG = 0.97, hB = 1.0
        r = bc.r + (hR - bc.r) * li * 0.95
        g = bc.g + (hG - bc.g) * li * 0.95
        b = bc.b + (hB - bc.b) * li * 0.95
      }

      cArr[idx]   = THREE.MathUtils.lerp(r, _targetCol.r, gridFactor)
      cArr[idx+1] = THREE.MathUtils.lerp(g, _targetCol.g, gridFactor)
      cArr[idx+2] = THREE.MathUtils.lerp(b, _targetCol.b, gridFactor)
    }
    pa.needsUpdate = true
    ca.needsUpdate = true
    line.material.opacity = THREE.MathUtils.lerp(data.opacity, 0.45, gridFactor) * baseDepthFade * gridOpacityMult
  }
}

function animateBeam(time, sp) {
  if (time === _lastBeamTime && sp === _lastBeamSp) return
  _lastBeamTime = time
  _lastBeamSp = sp

  if (!beamPivot) return
  let targetY=0, targetX=0.08, beamMult=1.0
  const isScrolling = sp > 0.005
  if (!isScrolling) {
    if (wasScrolling) { wasScrolling=false; returnToIdleTime=time; baseBeamAngle=beamPivot.rotation.y; idlePhase=baseBeamAngle-(time*0.20+Math.sin(time*0.12)*2.2) }
    const elapsed=time-returnToIdleTime
    const slow=time*0.20, s1=Math.sin(time*0.12)*2.2, s2=Math.cos(time*0.41)*0.5
    const wanderY=slow+s1+s2
    const pOsc=Math.sin(time*0.3)*0.03+Math.cos(time*0.67)*0.015
    const wanderX=0.06+pOsc
    if(elapsed<IDLE_RESET_DELAY){
      const b=Math.min(1,elapsed/IDLE_RESET_DELAY), e=smoothstep(b)
      targetY=baseBeamAngle+shortestDelta(baseBeamAngle,wanderY+idlePhase)*e
      targetX=THREE.MathUtils.lerp(beamPivot.rotation.x,wanderX,e)
    } else { targetY=wanderY+idlePhase; targetX=wanderX }
  } else if (sp >= WHITE_OUT_THRESHOLD) {
    wasScrolling=true; targetY=0; targetX=-0.02
  } else {
    if(!wasScrolling){ scrollStartAngle=beamPivot.rotation.y; scrollStartAngleX=beamPivot.rotation.x; wasScrolling=true }
    const e=smoothstep(sp/WHITE_OUT_THRESHOLD)
    targetY=scrollStartAngle+shortestDelta(scrollStartAngle,0)*e
    targetX=THREE.MathUtils.lerp(scrollStartAngleX,-0.02,e)
  }
  beamPivot.rotation.y=targetY; beamPivot.rotation.x=targetX

  const beamBoost=Math.pow(sp,1.5)*0.4
  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  
  const beamFade = Math.max(0, 1.0 - wof)
  
  const baseVals=[0.85,0.45,0.15]
  beamCones.forEach((c,i)=>{ c.material.uniforms.uOpacity.value=(baseVals[i]+beamBoost*(i===2?1.8:1.2)+wof*1.5)*beamMult*beamFade })
  beamRays.forEach(r=>{ r.material.opacity=(0.45+sp*0.35+wof*0.5)*beamMult*beamFade })
  if(beamGlow) beamGlow.material.opacity = 0.95 * beamFade
  if(_ptLightRef) _ptLightRef.intensity=(3.0+Math.pow(sp,1.5)*12+wof*50)*beamMult*beamFade
}

function animateDust(time, sp) {
  if (time === _lastDustTime && sp === _lastDustSp) return
  _lastDustTime = time
  _lastDustSp = sp

  if (dustParticles.length === 0 || !camera) return

  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const isFullyFormed3 = act3Progress >= 0.95

  if (sp < WHITE_OUT_END && beamPivot) {
    beamPivot.getWorldPosition(_dustBwo)
    _dustBeamDir.set(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()
  }

  let bestDist = 1e9, bestIdx = -1
  const _scratch = _dustProjectScratch

  if (isFullyFormed3) {
    for (let i = 0; i < dustParticles.length; i++) {
      const p = dustParticles[i]
      const d = p.userData
      if (!d.isMainPlanet) continue
      
      _scratch.copy(p.position).project(camera)
      const dx = (_scratch.x - _mouseNDC.x) * (camera.aspect || 1)
      const dy = _scratch.y - _mouseNDC.y
      const dist = Math.hypot(dx, dy)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    const exitThreshold = (_hoveredIdx >= 0) ? 0.22 : 0.16
    _hoveredIdx = bestDist < exitThreshold ? bestIdx : -1
  } else {
    _hoveredIdx = -1
  }

  if (canvasRef.value) {
    canvasRef.value.style.cursor = (_hoveredIdx >= 0) ? 'pointer' : ''
  }

  if (_lastTimeSec === 0) _lastTimeSec = time
  const dt = Math.min(0.1, time - _lastTimeSec)
  _lastTimeSec = time

  const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z

  for (let idx = 0; idx < dustParticles.length; idx++) {
    const p = dustParticles[idx]
    const d = p.userData

    const targetHover = (idx === _hoveredIdx && isFullyFormed3) ? 1.0 : 0.0
    d.hoverFactor = d.hoverFactor ?? 0.0
    d.hoverFactor += (targetHover - d.hoverFactor) * 0.10 

    const bx = d.wx + Math.sin(time * 0.4 + d.ph) * 0.25
    const by = d.wy + Math.sin(time * 0.3 + d.ph + 1) * 0.18
    const bz = d.wz + Math.sin(time * 0.25 + d.ph + 2) * 0.15

    const focusSlowdown = (!d.isMainPlanet && _focusedPlanetIdx >= 0) ? 0.05 : 1.0
    const effectiveSpeed = d._baseSpeed * (1.0 - d.hoverFactor * 0.80) * focusSlowdown
    d.orbitAngle += dt * effectiveSpeed

    const wobbleR = d.isMainPlanet ? d.orbitR : d.orbitR + Math.sin(time * d.wobbleFreq + d.ph) * d.wobbleAmp
    let ox, oy, oz
    if (d.isMainPlanet && d.orbitR > 20) {
      // Elliptical orbit (menu planet): star at focus, inclined
      const a = ELLIPSE_A, b = ELLIPSE_B, c = ELLIPSE_C
      const ex = a * Math.cos(d.orbitAngle) - c
      const ez = b * Math.sin(d.orbitAngle)
      ox = cx + ex
      oy = cy + ez * Math.sin(ELLIPSE_INCL)
      oz = cz + ez * Math.cos(ELLIPSE_INCL)
    } else {
      ox = cx + Math.cos(d.orbitAngle) * wobbleR
      oy = cy
      oz = cz + Math.sin(d.orbitAngle) * wobbleR
    }

    p.position.set(
      THREE.MathUtils.lerp(bx, ox, smoothProgress3),
      THREE.MathUtils.lerp(by, oy, smoothProgress3),
      THREE.MathUtils.lerp(bz, oz, smoothProgress3)
    )

    const refPos = d.isMainPlanet ? camera.position : _defaultCamPos
    const cd = p.position.distanceTo(refPos)
    const ds = 22 / Math.max(5, cd)

    let bf = 0
    if (sp < WHITE_OUT_END && beamPivot) {
      _dustToP.subVectors(p.position, _dustBwo)
      const proj = _dustToP.dot(_dustBeamDir)
      if (proj > 0 && proj < 45) {
        _dustPp.copy(_dustBwo).addScaledVector(_dustBeamDir, proj)
        const dist = p.position.distanceTo(_dustPp)
        const br = (proj / 45) * 5.5 + 0.2
        if (dist < br) bf = Math.pow(1 - dist / br, 1.8)
      }
    }

    const scaleAct1 = d.scale * (0.4 + bf * 2) * ds
    const scaleAct2 = d.scale * 0.7 * d.sizeBoost * ds
    const scaleAct3 = scaleAct2 * d.scaleMult

    let currentScale = THREE.MathUtils.lerp(scaleAct1, scaleAct2, wof)
    currentScale = THREE.MathUtils.lerp(currentScale, scaleAct3, smoothProgress3)

    p.scale.setScalar(currentScale * (1.0 + d.hoverFactor * 0.35))

    let opacityAct1 = (0.14 + bf * 0.76) * (0.35 + sp * 0.65)
    if (cd < 7) opacityAct1 *= Math.max(0, (cd - 2.5) / 4.5)
    if (cd > 42) opacityAct1 *= Math.max(0, 1 - (cd - 42) / 10)

    const opacityAct2 = 0.4
    const opacityAct3 = d.isMainPlanet ? 1.0 : 0.55

    let currentOpacity = THREE.MathUtils.lerp(opacityAct1, opacityAct2, wof)
    p.material.opacity = THREE.MathUtils.lerp(currentOpacity, opacityAct3, smoothProgress3)

    if (_focusedPlanetIdx >= 0 && idx !== _focusedPlanetIdx) {
      const fp = dustParticles[_focusedPlanetIdx]
      _occCamToPlanet.subVectors(fp.position, camera.position).normalize()
      _occToParticle.subVectors(p.position, camera.position)
      const projDist = _occToParticle.dot(_occCamToPlanet)
      const fpDist = fp.position.distanceTo(camera.position)
      if (projDist > 0.5 && projDist < fpDist - 0.3) {
        _occProj.copy(camera.position).addScaledVector(_occCamToPlanet, projDist)
        const perpDist = p.position.distanceTo(_occProj)
        const occRadius = currentScale * 0.6 + 0.06
        if (perpDist < occRadius) {
          p.material.opacity *= 0.12
        }
      }
    }

    _colorAct2.set(d.grayHex)
    _currentColor.copy(_colorAct1).lerp(_colorAct2, wof).lerp(_colorAct3, smoothProgress3)
    p.material.color.copy(_currentColor)
  }
}

// ---- camera focus system (Act 3 planet focus with orbit + auto-unfocus) ----
const FOCUS_TIMEOUT = 30 

function updateCameraFocus(sp, time) {
  const isAct3 = sp >= GRID_SHIFT_START
  if (!isAct3) {
    if (_focusedPlanetIdx >= 0) {
      _focusedPlanetIdx = -1
      _focusStartTime = 0
      emit('focusChange', false)
    }
    return
  }

  const focusedPlanet = (_focusedPlanetIdx >= 0) ? dustParticles[_focusedPlanetIdx] : null

  if (focusedPlanet && _focusStartTime > 0 && time - _focusStartTime > FOCUS_TIMEOUT) {
    _focusedPlanetIdx = -1
    _focusStartTime = 0
    emit('focusChange', false)
  }

  const isFocused = _focusedPlanetIdx >= 0
  const planet = isFocused ? dustParticles[_focusedPlanetIdx] : null

  if (planet && planet.userData.isMainPlanet) {
    _camToStar.subVectors(_starPos, planet.position).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()

    const isMenu = (planet.userData.orbitR || 0) > 20
    const behindDist = isMenu ? 3.2 : 2.5
    const sideDist = isMenu ? 2.8 : 2.2
    const orbitR = planet.userData.orbitR || 4.5

    _focusAxisPoint.copy(planet.position)
      .addScaledVector(_camToStar, orbitR * 0.25)

    _focusOrbitAngle = (time - _focusStartTime) * 0.024
    _focusOrbitQuat.setFromAxisAngle(_camToStar, _focusOrbitAngle)

    _camOffsetDir.copy(planet.position)
      .addScaledVector(_camToStar, -behindDist)
      .addScaledVector(_camLeftDir, sideDist)
    _focusBaseOffset.subVectors(_camOffsetDir, _focusAxisPoint)
    _focusBaseOffset.applyQuaternion(_focusOrbitQuat)
    _camOffsetDir.copy(_focusAxisPoint).add(_focusBaseOffset)

    const camLerp = isMenu ? 0.015 : 0.04
    _targetCamPos.lerp(_camOffsetDir, camLerp)
    _targetLookAt.lerp(_focusAxisPoint, camLerp)
  } else {
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
  }

  _currentLookAt.lerp(_targetLookAt, 0.06)
  camera.position.lerp(_targetCamPos, 0.06)
  camera.lookAt(_currentLookAt)

  camera.updateMatrixWorld()

  // 相机稳定停靠度：运镜中→0，停靠后→1
  const distToTarget = camera.position.distanceTo(_targetCamPos)
  const stabilization = Math.max(0, Math.min(1, 1 - distToTarget / 1.5))

  // 视锥体正面判定：防止背面翻转导致的投影错乱
  const _viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const starInFront = new THREE.Vector3().subVectors(_starPos, camera.position).dot(_viewDir) > 0
  let planetInFront = false
  if (planet) {
    planet.updateMatrixWorld(true)
    planet.getWorldPosition(_planetWorldPos)
    planetInFront = new THREE.Vector3().subVectors(_planetWorldPos, camera.position).dot(_viewDir) > 0
  }

  // 平滑插值左下角及左上角 HUD 的动效变化
  _focusUIProgress += ((isFocused ? 1.0 : 0.0) - _focusUIProgress) * 0.12

  // 综合 UI 渲染不透明度：运镜中淡出，锁定后淡入
  let activeUIAlpha = _focusUIProgress * stabilization * stabilization
  if (!starInFront || !planetInFront) activeUIAlpha = 0

  // 独立反色层：mix-blend-mode: difference 实现硬件级像素反色
  const invertCanvas = invertCanvasRef.value
  if (invertCanvas) {
    const invCtx = invertCanvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = renderer.domElement.getBoundingClientRect()
    const w = rect.width, h = rect.height

    if (invertCanvas.width !== w * dpr || invertCanvas.height !== h * dpr) {
      invertCanvas.width = w * dpr
      invertCanvas.height = h * dpr
      invertCanvas.style.width = w + 'px'
      invertCanvas.style.height = h + 'px'
      invertCanvas.style.left = rect.left + 'px'
      invertCanvas.style.top = rect.top + 'px'
    }
    invCtx.clearRect(0, 0, invertCanvas.width, invertCanvas.height)
    invCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (isFocused && planet && activeUIAlpha > 0.01) {
      // 复用已计算的切线与投影数据（来自后续 overlay 绘制中的 getPreciseProjectedSphere 与切线公式）
      function toScreen(v3, out) {
        out.copy(v3).project(camera)
        out.x = (out.x * 0.5 + 0.5) * w
        out.y = (-out.y * 0.5 + 0.5) * h
        return out
      }

      // 获取与 overlay 相同的投影数据
      const _getPS = (sp, r, oc) => {
        _vCamToPlanet.subVectors(camera.position, sp)
        const d = _vCamToPlanet.length()
        if (d <= r) { toScreen(sp, oc); return { rx: 0, ry: 0 } }
        _vCamToPlanet.divideScalar(d)
        _uRight.set(1,0,0).applyQuaternion(camera.quaternion)
        const dr = _uRight.dot(_vCamToPlanet)
        _uRight.addScaledVector(_vCamToPlanet, -dr).normalize()
        _uUp.set(0,1,0).applyQuaternion(camera.quaternion)
        const du = _uUp.dot(_vCamToPlanet)
        _uUp.addScaledVector(_vCamToPlanet, -du).normalize()
        const x = (r*r)/d, rT = Math.sqrt(Math.max(0,r*r-x*x))
        _sTangent.copy(sp).addScaledVector(_vCamToPlanet, x)
        _tRight.copy(_sTangent).addScaledVector(_uRight, rT)
        _tLeft.copy(_sTangent).addScaledVector(_uRight, -rT)
        _tTop.copy(_sTangent).addScaledVector(_uUp, rT)
        _tBottom.copy(_sTangent).addScaledVector(_uUp, -rT)
        toScreen(_tRight,_ssTRight); toScreen(_tLeft,_ssTLeft)
        toScreen(_tTop,_ssTTop); toScreen(_tBottom,_ssTBottom)
        oc.x=(_ssTRight.x+_ssTLeft.x)*0.5; oc.y=(_ssTTop.y+_ssTBottom.y)*0.5
        return { rx: _ssTRight.distanceTo(_ssTLeft)*0.5, ry: _ssTTop.distanceTo(_ssTBottom)*0.5 }
      }

      const starRes = _getPS(_starPos, 0.42, _ssStar)
      planet.updateMatrixWorld(true)
      planet.getWorldPosition(_planetWorldPos)
      const planetRes = _getPS(_planetWorldPos, 0.015*planet.scale.x, _ssPlanet)

      // Temporal smoothing to prevent inversion region flicker during camera move
      const rawStarDRX = starRes.rx + 8, rawStarDRY = starRes.ry + 8
      const rawPlanetDRX = planetRes.rx + 6, rawPlanetDRY = planetRes.ry + 6
      const rawStarX = _ssStar.x, rawStarY = _ssStar.y
      const rawPlanetX = _ssPlanet.x, rawPlanetY = _ssPlanet.y

      const smooth = 0.35 // lower = smoother, higher = more responsive
      if (!_smoothInvertInit || !isFocused) {
        _smoothStarX = rawStarX; _smoothStarY = rawStarY
        _smoothStarRX = rawStarDRX; _smoothStarRY = rawStarDRY
        _smoothPlanetX = rawPlanetX; _smoothPlanetY = rawPlanetY
        _smoothPlanetRX = rawPlanetDRX; _smoothPlanetRY = rawPlanetDRY
        _smoothInvertInit = isFocused
      } else {
        _smoothStarX += (rawStarX - _smoothStarX) * smooth
        _smoothStarY += (rawStarY - _smoothStarY) * smooth
        _smoothStarRX += (rawStarDRX - _smoothStarRX) * smooth
        _smoothStarRY += (rawStarDRY - _smoothStarRY) * smooth
        _smoothPlanetX += (rawPlanetX - _smoothPlanetX) * smooth
        _smoothPlanetY += (rawPlanetY - _smoothPlanetY) * smooth
        _smoothPlanetRX += (rawPlanetDRX - _smoothPlanetRX) * smooth
        _smoothPlanetRY += (rawPlanetDRY - _smoothPlanetRY) * smooth
      }

      const starDRX = _smoothStarRX, starDRY = _smoothStarRY
      const planetDRX = _smoothPlanetRX, planetDRY = _smoothPlanetRY
      const sStarX = _smoothStarX, sStarY = _smoothStarY
      const sPlanetX = _smoothPlanetX, sPlanetY = _smoothPlanetY

      const dx = sPlanetX-sStarX, dy = sPlanetY-sStarY
      const dist = Math.hypot(dx,dy), theta = Math.atan2(dy,dx)
      const drVal = starDRX-planetDRX
      const phi = (dist > Math.abs(drVal) && isFinite(dist)) ? Math.asin(Math.max(-1, Math.min(1, drVal/dist))) : 0
      const a1 = theta+Math.PI/2-phi, a2 = theta-Math.PI/2+phi

      const ts1x=sStarX+starDRX*Math.cos(a1), ts1y=sStarY+starDRY*Math.sin(a1)
      const ts2x=sStarX+starDRX*Math.cos(a2), ts2y=sStarY+starDRY*Math.sin(a2)
      const tp1x=sPlanetX+planetDRX*Math.cos(a1), tp1y=sPlanetY+planetDRY*Math.sin(a1)
      const tp2x=sPlanetX+planetDRX*Math.cos(a2), tp2y=sPlanetY+planetDRY*Math.sin(a2)

      const tdx1=tp1x-ts1x, tdy1=tp1y-ts1y, tl1=Math.hypot(tdx1,tdy1)||1
      const tdx2=tp2x-ts2x, tdy2=tp2y-ts2y, tl2=Math.hypot(tdx2,tdy2)||1
      const ux1=tdx1/tl1, uy1=tdy1/tl1, ux2=tdx2/tl2, uy2=tdy2/tl2

      const extLen = Math.max(w,h)*2
      const es1x=ts1x-ux1*extLen, es1y=ts1y-uy1*extLen
      const es2x=ts2x-ux2*extLen, es2y=ts2y-uy2*extLen
      const ep1x=tp1x+ux1*extLen, ep1y=tp1y+uy1*extLen
      const ep2x=tp2x+ux2*extLen, ep2y=tp2y+uy2*extLen

      const distInv = Math.hypot(sPlanetX-sStarX, sPlanetY-sStarY)
      const mathValidInv = distInv > Math.abs(starDRX-planetDRX) + 15 && isFinite(distInv) && distInv > 10

      if (mathValidInv) {
      invCtx.save()
      invCtx.globalAlpha = activeUIAlpha
      invCtx.fillStyle = '#ffffff'

      // 左外侧反色区：上切线左延→恒星外弧→下切线左延 闭合
      invCtx.beginPath()
      invCtx.moveTo(es1x, es1y)
      invCtx.lineTo(ts1x, ts1y)
      invCtx.ellipse(sStarX, sStarY, starDRX, starDRY, 0, a1, a2, false)
      invCtx.lineTo(es2x, es2y)
      invCtx.closePath()
      invCtx.fill()

      // 右外侧反色区：下切线右延→行星外弧→上切线右延 闭合
      invCtx.beginPath()
      invCtx.moveTo(ep2x, ep2y)
      invCtx.lineTo(tp2x, tp2y)
      invCtx.ellipse(sPlanetX, sPlanetY, planetDRX, planetDRY, 0, a2, a1, false)
      invCtx.lineTo(ep1x, ep1y)
      invCtx.closePath()
      invCtx.fill()

      invCtx.restore()
      } // mathValidInv
    }
  }

  const overlay = overlayRef.value
  if (overlay) {
    const ctx = overlay.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const rect = renderer.domElement.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
      overlay.width = w * dpr
      overlay.height = h * dpr
      overlay.style.width = w + 'px'
      overlay.style.height = h + 'px'
      overlay.style.left = rect.left + 'px'
      overlay.style.top = rect.top + 'px'
    }
    
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ============================================================
    //  HUD 常驻边框线框与比例尺 (放大)
    // ============================================================
    const margin = 30
    const cornerLen = 18
    const hudScale = 1.5
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)'
    ctx.lineWidth = 1.2

    // 定位拐角线框
    ctx.beginPath(); ctx.moveTo(margin, margin + cornerLen); ctx.lineTo(margin, margin); ctx.lineTo(margin + cornerLen, margin); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w - margin, margin + cornerLen); ctx.lineTo(w - margin, margin); ctx.lineTo(w - margin - cornerLen, margin); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(margin, h - margin - cornerLen); ctx.lineTo(margin, h - margin); ctx.lineTo(margin + cornerLen, h - margin); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w - margin, h - margin - cornerLen); ctx.lineTo(w - margin, h - margin); ctx.lineTo(w - margin - cornerLen, h - margin); ctx.stroke()

    // 绘制底部刻度尺
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(margin + 14, h - margin - 8)
    ctx.lineTo(margin + 100, h - margin - 8)
    ctx.moveTo(margin + 14, h - margin - 14); ctx.lineTo(margin + 14, h - margin - 2)
    ctx.moveTo(margin + 100, h - margin - 14); ctx.lineTo(margin + 100, h - margin - 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'
    ctx.font = `${10 * hudScale}px monospace`
    ctx.textAlign = 'left'
    ctx.fillText('GRID_UNIT: 50AU', margin + 18, h - margin - 16)

    // ============================================================
    //  左下角：聚焦后出现的动态编排版面 (Typographic Panel)
    // ============================================================
    if (_focusUIProgress > 0.01) {
      const textX = margin + 14
      const textY = h - margin - 110

      ctx.save()
      ctx.globalAlpha = _focusUIProgress

      const titleYOffset = _focusUIProgress * -12

      const titleSize = (18 + _focusUIProgress * 22) * hudScale
      ctx.font = `bold ${titleSize.toFixed(1)}px "Georgia", "Times New Roman", serif`

      const titleR = Math.round(100 - _focusUIProgress * 85)
      const titleG = Math.round(116 - _focusUIProgress * 93)
      const titleB = Math.round(139 - _focusUIProgress * 97)
      ctx.fillStyle = `rgb(${titleR}, ${titleG}, ${titleB})`
      ctx.fillText('Personal Site', textX, textY + titleYOffset)

      ctx.font = `bold ${10 * hudScale}px monospace`
      ctx.fillStyle = '#0f172a'
      ctx.fillText('YEQU_DESU // RADAR_TERMINAL_LOCK', textX, textY + titleYOffset - 78)

      ctx.font = `${10 * hudScale}px monospace`
      ctx.fillStyle = '#475569'
      ctx.fillText('PORTFOLIO DIRECTORY / SECURE GUIDANCE', textX, textY + titleYOffset + 44)
      ctx.fillText(`SYS_COORD: TARGET_ACTIVE (F_INDEX: 0${_mainPlanetIndices.indexOf(_focusedPlanetIdx) + 1})`, textX, textY + titleYOffset + 62)

      ctx.restore()
    }

    // ============================================================
    //  3. 左上角 HUD：放大 (聚焦后出现)
    // ============================================================
    const linkIdx = _mainPlanetIndices.indexOf(_focusedPlanetIdx)
    const link = linkIdx >= 0 ? _planetLinks[linkIdx] : null

    if (isFocused && planet && link && activeUIAlpha > 0.01) {
      ctx.save()
      ctx.globalAlpha = activeUIAlpha

      const tlX = margin + 14
      const tlY = margin + 22

      ctx.fillStyle = '#0f172a'
      ctx.font = `bold ${11 * hudScale}px monospace`
      ctx.fillText('TARGET_AQUISITION_CONSOLE', tlX, tlY)

      ctx.fillStyle = '#64748b'
      ctx.font = `${9 * hudScale}px monospace`
      const lh = 16 * hudScale
      ctx.fillText(`FOCUS_INDEX: 0${linkIdx + 1} // NOMINAL`, tlX, tlY + lh)
      ctx.fillText(`CAM_XYZ: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`, tlX, tlY + lh * 2)
      ctx.fillText(`ORBIT_VEL: ${(Math.abs(planet.userData.orbitSpeed) * 100).toFixed(1)} AU/S`, tlX, tlY + lh * 3)

      ctx.restore()

      // ============================================================
      //  3D 星体投影连线与其视觉构成绘制
      // ============================================================
      function toScreen(v3, out) {
        out.copy(v3).project(camera)
        out.x = (out.x * 0.5 + 0.5) * w
        out.y = (-out.y * 0.5 + 0.5) * h
        return out
      }

      // 计算精确边界半径（自适应透视拉伸）
      function getPreciseProjectedSphere(sphereWorldPos, radius, outScreenCenter) {
        _vCamToPlanet.subVectors(camera.position, sphereWorldPos)
        const d = _vCamToPlanet.length()
        if (d <= radius) { toScreen(sphereWorldPos, outScreenCenter); return { rx: 0, ry: 0 } }
        _vCamToPlanet.divideScalar(d)

        _uRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
        const dotR = _uRight.dot(_vCamToPlanet)
        _uRight.addScaledVector(_vCamToPlanet, -dotR).normalize()

        _uUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
        const dotU = _uUp.dot(_vCamToPlanet)
        _uUp.addScaledVector(_vCamToPlanet, -dotU).normalize()

        const x = (radius * radius) / d
        const rTangent = Math.sqrt(Math.max(0, radius * radius - x * x))

        _sTangent.copy(sphereWorldPos).addScaledVector(_vCamToPlanet, x)
        _tRight.copy(_sTangent).addScaledVector(_uRight, rTangent)
        _tLeft.copy(_sTangent).addScaledVector(_uRight, -rTangent)
        _tTop.copy(_sTangent).addScaledVector(_uUp, rTangent)
        _tBottom.copy(_sTangent).addScaledVector(_uUp, -rTangent)

        toScreen(_tRight, _ssTRight)
        toScreen(_tLeft, _ssTLeft)
        toScreen(_tTop, _ssTTop)
        toScreen(_tBottom, _ssTBottom)

        outScreenCenter.x = (_ssTRight.x + _ssTLeft.x) * 0.5
        outScreenCenter.y = (_ssTTop.y + _ssTBottom.y) * 0.5
        const radiusX = _ssTRight.distanceTo(_ssTLeft) * 0.5
        const radiusY = _ssTTop.distanceTo(_ssTBottom) * 0.5
        return { rx: radiusX, ry: radiusY }
      }

      // 获取恒星及行星精确数据
      const starRes = getPreciseProjectedSphere(_starPos, 0.42, _ssStar)

      planet.updateMatrixWorld(true)
      planet.getWorldPosition(_planetWorldPos)
      const planetRes = getPreciseProjectedSphere(_planetWorldPos, 0.015 * planet.scale.x, _ssPlanet)

      const starDrawRX = starRes.rx + 8, starDrawRY = starRes.ry + 8
      const planetDrawRX = planetRes.rx + 6, planetDrawRY = planetRes.ry + 6

      // 外公切线方程
      const dx = _ssPlanet.x - _ssStar.x, dy = _ssPlanet.y - _ssStar.y
      const dist = Math.hypot(dx, dy)
      const theta = Math.atan2(dy, dx)
      const dr = starDrawRX - planetDrawRX
      const phi = (dist > Math.abs(dr) && isFinite(dist) && dist > 0)
        ? Math.asin(Math.max(-1, Math.min(1, dr / dist))) : 0

      const alpha1 = theta + Math.PI / 2 - phi
      const alpha2 = theta - Math.PI / 2 + phi

      const ts1x = _ssStar.x + starDrawRX * Math.cos(alpha1), ts1y = _ssStar.y + starDrawRY * Math.sin(alpha1)
      const ts2x = _ssStar.x + starDrawRX * Math.cos(alpha2), ts2y = _ssStar.y + starDrawRY * Math.sin(alpha2)
      const tp1x = _ssPlanet.x + planetDrawRX * Math.cos(alpha1), tp1y = _ssPlanet.y + planetDrawRY * Math.sin(alpha1)
      const tp2x = _ssPlanet.x + planetDrawRX * Math.cos(alpha2), tp2y = _ssPlanet.y + planetDrawRY * Math.sin(alpha2)

      const extLen = Math.max(w, h) * 2  
      const tdx1 = tp1x - ts1x, tdy1 = tp1y - ts1y, tl1 = Math.hypot(tdx1, tdy1) || 1
      const tdx2 = tp2x - ts2x, tdy2 = tp2y - ts2y, tl2 = Math.hypot(tdx2, tdy2) || 1

      // 外公切线几何有效性判定：防止星体重合时产生奇异点
      const distOv = Math.hypot(_ssPlanet.x - _ssStar.x, _ssPlanet.y - _ssStar.y)
      const mathValidOv = distOv > Math.abs(starDrawRX - planetDrawRX) + 15 && isFinite(distOv) && distOv > 10

      if (mathValidOv) {
      ctx.save()
      ctx.globalAlpha = activeUIAlpha

      // 绘制恒星与行星视界圈
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.ellipse(_ssStar.x, _ssStar.y, starDrawRX, starDrawRY, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(_ssPlanet.x, _ssPlanet.y, planetDrawRX, planetDrawRY, 0, 0, Math.PI * 2); ctx.stroke()

      // 【核心改进】加深外切线条的颜色与不透明度，使其成为指引视觉流向的主干线
      ctx.setLineDash([])
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.0
      ctx.beginPath(); ctx.moveTo(ts1x - (tdx1 / tl1) * extLen, ts1y - (tdy1 / tl1) * extLen)
      ctx.lineTo(tp1x + (tdx1 / tl1) * extLen, tp1y + (tdy1 / tl1) * extLen); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ts2x - (tdx2 / tl2) * extLen, ts2y - (tdy2 / tl2) * extLen)
      ctx.lineTo(tp2x + (tdx2 / tl2) * extLen, tp2y + (tdy2 / tl2) * extLen); ctx.stroke()

      // 绘制球体中心十字定位点
      const drawAnchor = (x, y, sz = 5) => {
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)'
        ctx.lineWidth = 0.75
        ctx.beginPath()
        ctx.moveTo(x - sz, y); ctx.lineTo(x + sz, y)
        ctx.moveTo(x, y - sz); ctx.lineTo(x, y + sz)
        ctx.stroke()
      }
      drawAnchor(_ssStar.x, _ssStar.y, 6)
      drawAnchor(_ssPlanet.x, _ssPlanet.y, 4)

      // 沿切线流动的能量游标
      const flowT = (time * 0.4) % 1.0
      ctx.fillStyle = '#475569'
      ctx.beginPath()
      ctx.arc(ts1x + tdx1 * flowT, ts1y + tdy1 * flowT, 1.5, 0, Math.PI * 2)
      ctx.arc(ts2x + tdx2 * flowT, ts2y + tdy2 * flowT, 1.5, 0, Math.PI * 2)
      ctx.fill()

      // 恒星扫描射线
      const rayCount = 16
      const rayMaxDist = Math.hypot(w, h)
      const rayDuration = 1.2
      const rayStagger = 0.04
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)'; ctx.lineWidth = 0.5
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2
        const cosA = Math.cos(angle), sinA = Math.sin(angle)
        const startT = _focusStartTime + i * rayStagger
        const elapsed = Math.max(0, time - startT)
        const rawT = Math.min(1, elapsed / rayDuration)
        const eased = rawT * rawT * rawT * rawT
        const rayStartR = (starDrawRX + starDrawRY) * 0.5
        const rayLen = rayStartR + 4 + eased * rayMaxDist
        ctx.beginPath()
        ctx.moveTo(_ssStar.x + cosA * (rayStartR + 4), _ssStar.y + sinA * (rayStartR + 4))
        ctx.lineTo(_ssStar.x + cosA * rayLen, _ssStar.y + sinA * rayLen)
        ctx.stroke()
      }

      // ============================================================
      //  自适应引线面板 (深色高对比卡片)
      // ============================================================
      const sideSign = (_ssPlanet.x >= _ssStar.x) ? 1 : -1
      const leadLen = 75
      const elbowX = _ssPlanet.x + 25 * sideSign
      const elbowY = _ssPlanet.y - 45
      const endX = _ssPlanet.x + leadLen * sideSign
      const endY = elbowY

      // 绘制自适应引导引线
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 0.75
      ctx.beginPath()
      ctx.moveTo(_ssPlanet.x, _ssPlanet.y)
      ctx.lineTo(elbowX, elbowY)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      // 装饰小方块
      ctx.fillStyle = link.accent
      ctx.fillRect(endX - (sideSign > 0 ? 0 : 2), endY - 2, 2, 4)

      const panelW = 125
      const panelH = 54
      const panelX = (sideSign > 0) ? endX + 8 : endX - panelW - 8
      const panelY = endY - 22

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)' 
      ctx.fillRect(panelX, panelY, panelW, panelH)

      // 坚实的卡片边框
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1.0
      ctx.strokeRect(panelX, panelY, panelW, panelH)

      // 行星强调色跳转按钮
      const blockW = 113
      const blockH = 17
      const blockX = panelX + 6
      const blockY = panelY + 6
      ctx.fillStyle = link.accent
      ctx.fillRect(blockX, blockY, blockW, blockH)

      // 镂空跳转文字
      ctx.fillStyle = '#0f172a' 
      ctx.font = 'bold 8px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`LAUNCH ➔ ${link.label}`, blockX + 6, blockY + 11.5)

      // 技术辅助元数据
      ctx.fillStyle = '#f1f5f9'
      ctx.font = '7.5px monospace'
      ctx.fillText(`SYS_LOC: [${_planetWorldPos.x.toFixed(1)}, ${_planetWorldPos.z.toFixed(1)}]`, blockX, blockY + 28)
      ctx.fillStyle = '#cbd5e1'
      ctx.fillText(`GATEWAY: ${(link.url || 'MENU_SYSTEM').replace('https://', '')}`, blockX, blockY + 38)
      ctx.restore()
      } // mathValidOv
    }
  }
}

act1.exit = () => {
  ctx.set('oceanLines', oceanLines)
  ctx.set('waveData', waveData)
  ctx.set('waveBaseColors', waveBaseColors)
  ctx.set('beamFinalAngleY', beamPivot ? beamPivot.rotation.y : 0)
  ctx.set('beamFinalAngleX', beamPivot ? beamPivot.rotation.x : -0.02)
  if (_ptLightRef) _ptLightRef.intensity = 0
}

act1.dispose = () => {}

// ============================================================
//  ACT 2  GRID PLANARIZATION
// ============================================================
const act2 = { name: 'GridTransition', start: WHITE_OUT_THRESHOLD, end: GRID_SHIFT_START }

let gridVerticalLines = []
let _gridPoints = null

act2.build = () => {
  buildVerticalGridLines()
  buildGridJunctionNodes()
}

function buildGridJunctionNodes() {
  if (_gridPoints) return
  const dotPts = []
  for (let i = 0; i < 14; i++) {
    const x = -26 + (i / 13) * 52
    for (let j = 0; j < 15; j++) {
      const z = -48 + (j / 14) * 52
      dotPts.push(new THREE.Vector3(x, -2.5, z))
    }
  }
  const dotGeo = new THREE.BufferGeometry().setFromPoints(dotPts)
  const dotMat = new THREE.PointsMaterial({
    color: '#94a3b8',
    size: 0.052,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true
  })
  _gridPoints = new THREE.Points(dotGeo, dotMat)
  _gridPoints.renderOrder = 2
  scene.add(_gridPoints)
}

function buildVerticalGridLines() {
  if (gridVerticalLines.length > 0) return
  const totalLines=28, zStart=-52, zEnd=12, baseY=-2.5
  for(let i=0;i<totalLines;i++){
    const x=-28+(i/(totalLines-1))*56
    const pts=[new THREE.Vector3(x,baseY,zStart), new THREE.Vector3(x,baseY,zStart)]
    const g=new THREE.BufferGeometry().setFromPoints(pts)
    const nearColor = new THREE.Color('#94a3b8')
    const farColor  = new THREE.Color('#f1f5f9')
    g.setAttribute('color', new THREE.Color('#aed2ff'))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
      farColor.r, farColor.g, farColor.b,
      nearColor.r, nearColor.g, nearColor.b
    ]), 3))
    const mat=new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false
    })
    const line=new THREE.Line(g,mat)
    line.renderOrder = 2
    scene.add(line)
    gridVerticalLines.push({ line, x, baseY, zStart, zEnd, staggerOffset: Math.random()*0.45 })
  }
}

act2.animate = (time, tSp, sp) => {
  animateVerticalGrid(sp)
}

function animateVerticalGrid(sp) {
  if (sp === _lastGridSp) return
  _lastGridSp = sp

  const vertFactor = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothProgress3

  if (gridOpacityMult < 0.001) {
    if (gridLinesVisible) {
      for (const vd of gridVerticalLines) {
        vd.line.visible = false
      }
      if (_gridPoints) _gridPoints.visible = false
      gridLinesVisible = false
    }
    return
  } else {
    if (!gridLinesVisible) {
      for (const vd of gridVerticalLines) {
        vd.line.visible = true
      }
      if (_gridPoints) _gridPoints.visible = true
      gridLinesVisible = true
    }
  }

  if (sp < VERTICAL_START) {
    return
  }

  const shiftY = -32.0 * smoothProgress3

  for (const vd of gridVerticalLines) {
    const lp = Math.max(0, Math.min(1, (vertFactor - vd.staggerOffset) / 0.55))
    const curZ = THREE.MathUtils.lerp(vd.zStart, vd.zEnd, lp)
    const pArr = vd.line.geometry.attributes.position.array
    
    pArr[1] = vd.baseY + shiftY
    pArr[4] = vd.baseY + shiftY
    pArr[5] = curZ
    
    vd.line.geometry.attributes.position.needsUpdate = true
    vd.line.material.opacity = Math.min(0.75, lp * 0.75) * gridOpacityMult
  }

  if (_gridPoints) {
    const gridFactor = Math.max(0, Math.min(1, (sp - GRID_START) / (VERTICAL_START - GRID_START)))
    _gridPoints.position.y = shiftY
    _gridPoints.material.opacity = gridFactor * 0.55 * gridOpacityMult
  }
}

act2.exit = () => {
  ctx.set('gridVerticalLines', gridVerticalLines)
}

act2.dispose = () => {}

// ============================================================
//  ACT 3  DOUBLE RING & GRID DESCENT
// ============================================================
// 关键优化：调整 Act 3 的起点至 TEXT_START (0.70)，使恒星和环带在第二幕文字出现时同步渐变出现
const act3 = { name: 'ContentPhase', start: TEXT_START, end: 1.00 }

let act3Initialized = false
let _mouseNDC = { x: 999, y: 999 }
let _ringFreeze = 0
let _hoveredIdx = -1
let _focusedPlanetIdx = -1

let _orbitLines = []
let _gyroGroups = []
let _planetLabels = []
let _starGroup = null
let _starGlow = null
let _wedgeRings = []
let _labelOpacityCurrent = 0
let _raycaster = null
let _lastTimeSec = 0

const _planetLinks = [
  { label: 'FS',     accent: '#94a3b8', url: 'https://fs.yequdesu.top' },
  { label: 'Code',   accent: '#0ea5e9', url: 'https://code.yequdesu.top' },
  { label: 'GitHub', accent: '#818cf8', url: 'https://github.com/yequdesu' },
  { label: 'Menu',   accent: '#64748b', url: null },
]

function createPlanetLabel(text, accentColor) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  ctx.font = '500 40px "Georgia", "Times New Roman", serif'
  const tw = ctx.measureText(text).width
  const padX = 28, padY = 16
  const pillW = Math.max(100, tw + padX * 2)
  const pillH = 56
  const pillX = (size - pillW) / 2
  const pillY = (128 - pillH) / 2
  const pillR = 10

  ctx.beginPath()
  ctx.moveTo(pillX + pillR, pillY)
  ctx.lineTo(pillX + pillW - pillR, pillY)
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR, pillR)
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR)
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH, pillR)
  ctx.lineTo(pillX + pillR, pillY + pillH)
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR, pillR)
  ctx.lineTo(pillX, pillY + pillR)
  ctx.arcTo(pillX, pillY, pillX + pillR, pillY, pillR)
  ctx.closePath()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#f1f5f9'
  ctx.font = '500 38px "Georgia", "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, 128 / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter

  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(1.8, 0.45, 1)

  sprite.renderOrder = 9999

  return sprite
}

act3.build = () => {
  if (act3Initialized) return

  for (let t = 0; t < ORBIT_COUNT; t++) {
    const pts = []
    if (t === 3) {
      // Elliptical orbit with star at focus
      for (let i = 0; i <= 200; i++) {
        const theta = (i / 200) * Math.PI * 2
        const ex = ELLIPSE_A * Math.cos(theta) - ELLIPSE_C
        const ez = ELLIPSE_B * Math.sin(theta)
        // Apply inclination (rotate around X)
        const ey = ez * Math.sin(ELLIPSE_INCL)
        const ez2 = ez * Math.cos(ELLIPSE_INCL)
        pts.push(new THREE.Vector3(ex, ey, ez2))
      }
    } else {
      const r = ORBIT_RADII[t]
      for (let i = 0; i <= 128; i++) {
        const theta = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r))
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    // Vertex color attribute for depth cue
    const colors = new Float32Array(pts.length * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const isElliptical = t === 3
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, depthTest: true
    })
    const line = new THREE.Line(geo, mat)
    line.userData.isElliptical = isElliptical

    line.position.set(0, -1.0, SCENE_CENTER_Z)
    line.renderOrder = 2
    
    scene.add(line)
    _orbitLines.push(line)
  }

  const gyroRadii = [7.8, 9.4, 11.0]
  const gyroTilts = [
    { x: Math.PI / 2 + 0.25, z: 0.35 },
    { x: Math.PI / 2 - 0.30, z: -0.40 },
    { x: Math.PI / 2 + 0.55, z: 0.15 },
  ]
  for (let g = 0; g < 3; g++) {
    const r = gyroRadii[g]
    const ringGeo = new THREE.RingGeometry(r - 0.04, r, 96)
    ringGeo.rotateX(gyroTilts[g].x)
    ringGeo.rotateZ(gyroTilts[g].z)
    const ringColors = new Float32Array(ringGeo.attributes.position.count * 3)
    ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3))
    const ringMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, depthTest: true })
    const ring = new THREE.LineLoop(ringGeo, ringMat)
    const group = new THREE.Group()
    group.add(ring)
    
    group.position.set(0, -1.0, SCENE_CENTER_Z)
    group.userData = { rotSpeed: 0.08 + g * 0.05 }
    
    ring.renderOrder = 2
    group.renderOrder = 2
    
    scene.add(group)
    _gyroGroups.push(group)
  }

  _starGroup = new THREE.Group()
  _starGroup.position.set(0, -1.0, SCENE_CENTER_Z)
  _starGroup.renderOrder = 1

  // 关键优化：使恒星实心球体材质透明并设不透明度为0，准备渐变淡入
  const coreGeo = new THREE.SphereGeometry(0.42, 32, 32)
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff8e7', transparent: true, opacity: 0 })
  const core = new THREE.Mesh(coreGeo, coreMat)
  _starGroup.add(core)

  const glowGeo = new THREE.SphereGeometry(0.70, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#ffe8c0',
    transparent: true,
    opacity: 0.30,
    depthWrite: false
  })
  _starGlow = new THREE.Mesh(glowGeo, glowMat)
  _starGroup.add(_starGlow)

  const haloSprite = (() => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    gradient.addColorStop(0, 'rgba(255,240,210,0.6)')
    gradient.addColorStop(0.15, 'rgba(255,220,170,0.35)')
    gradient.addColorStop(0.4, 'rgba(255,180,100,0.08)')
    gradient.addColorStop(0.7, 'rgba(255,140,60,0.01)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true
    }))
    sprite.scale.set(5.5, 5.5, 1)
    sprite.renderOrder = 1
    return sprite
  })()
  _starGroup.add(haloSprite)
  _starGroup.userData = { haloSprite }

  scene.add(_starGroup)

  // 初始化动态羽化纹理并应用
  const outerSectors = 240
  const outerMidR = 82.5
  const outerWidth = 9.0
  const outerArcLen = outerMidR * (Math.PI * 2) / outerSectors
  const wedgeWidth = outerArcLen * 0.5
  const outerTiltX = 0.55, outerTiltZ = -0.65, outerRotSpeed = 0.04
  const wedgeGeo = new THREE.PlaneGeometry(wedgeWidth, outerWidth)
  
  const wedgeMatTemplate = new THREE.MeshBasicMaterial({
    color: '#000000', // 初始黑色，防止首帧反色轮廓闪现
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    depthTest: true,
    fog: false // 禁用雾气，防止远距离雾化染色破坏反色混合
  })

  const outerRingGroup = new THREE.Group()
  outerRingGroup.position.copy(_starGroup.position)
  outerRingGroup.rotation.x = outerTiltX
  outerRingGroup.rotation.z = outerTiltZ
  outerRingGroup.renderOrder = 1
  scene.add(outerRingGroup)

  const outerWedgeGroups = []
  const phaseDelta = (Math.PI * 2) / outerSectors
  for (let i = 0; i < outerSectors; i++) {
    const angle = (i / outerSectors) * Math.PI * 2
    const wg = new THREE.Group()
    wg.position.set(Math.cos(angle) * outerMidR, 0, Math.sin(angle) * outerMidR)
    wg.rotation.y = -angle + Math.PI / 2

    const wMat = wedgeMatTemplate.clone()
    const wMesh = new THREE.Mesh(wedgeGeo, wMat)
    wMesh.renderOrder = 1
    wg.add(wMesh)
    outerRingGroup.add(wg)
    outerWedgeGroups.push({ group: wg, mesh: wMesh, phase: i * phaseDelta * 3.0 })
  }
  _wedgeRings.push({ isIndividual: true, outerRingGroup, outerWedgeGroups, rotSpeed: outerRotSpeed, tiltX: outerTiltX, tiltZ: outerTiltZ })

  for (let t = 0; t < ORBIT_COUNT; t++) {
    const link = _planetLinks[t]
    const sprite = createPlanetLabel(link.label, link.accent)
    sprite.position.set(0, -1.0, SCENE_CENTER_Z)
    sprite.name = `planetLabel_${t}`
    scene.add(sprite)
    _planetLabels.push(sprite)
  }

  _raycaster = new THREE.Raycaster()
  _raycaster.params.Points.threshold = 0
  _raycaster.params.Line = undefined
  _lastTimeSec = 0
  act3Initialized = true
}

act3.animate = (time, tSp, sp) => {
  // 1. 恒星和楔形环：在第二幕文字出现后（TEXT_START 0.70 到 GRID_SHIFT_START 0.85 之间）平滑淡入 [0 -> 1]
  const starWedgeProgress = Math.max(0, Math.min(1, (sp - TEXT_START) / (GRID_SHIFT_START - TEXT_START)))
  const smoothStarWedge = starWedgeProgress * starWedgeProgress * (3 - 2 * starWedgeProgress)

  // 2. 轨道与聚焦系统：在第三幕开始后（GRID_SHIFT_START 0.85 到 1.00 之间）平滑淡入 [0 -> 1]
  const orbitFocusProgress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothOrbitFocus = orbitFocusProgress * orbitFocusProgress * (3 - 2 * orbitFocusProgress)

  // 轨道线淡入（顶点级深度颜色）
  for (const line of _orbitLines) {
    line.visible = sp >= GRID_SHIFT_START
    const isElliptical = line.userData.isElliptical
    const baseOpacity = isElliptical ? 0.55 : 0.35
    const focusBoost = baseOpacity + _focusUIProgress * 0.45
    line.material.opacity = smoothOrbitFocus * focusBoost
    // Update vertex colors based on camera distance
    if (line.visible && line.geometry.attributes.color) {
      const pa = line.geometry.attributes.position
      const ca = line.geometry.attributes.color
      const pArr = pa.array; const cArr = ca.array
      for (let i = 0; i < pArr.length / 3; i++) {
        const idx = i * 3
        _orbitTempV.set(pArr[idx], pArr[idx+1], pArr[idx+2]).applyMatrix4(line.matrixWorld)
        const dist = _orbitTempV.distanceTo(camera.position)
        const tDist = Math.max(0, Math.min(1, (dist - 10) / 32.0))
        _orbitTempCol.copy(_orbitNearCol).lerp(_orbitFarCol, tDist * 0.82)
        cArr[idx]=_orbitTempCol.r; cArr[idx+1]=_orbitTempCol.g; cArr[idx+2]=_orbitTempCol.b
      }
      ca.needsUpdate = true
    }
  }

  // 陀螺仪外环淡入（顶点级深度颜色）
  for (const g of _gyroGroups) {
    g.visible = sp >= GRID_SHIFT_START
    g.rotation.y = time * g.userData.rotSpeed * 0.96
    const ring = g.children[0]
    if (ring) {
      ring.material.opacity = smoothOrbitFocus * 0.28
      if (ring.visible && ring.geometry.attributes.color) {
        const pa = ring.geometry.attributes.position
        const ca = ring.geometry.attributes.color
        const pArr = pa.array; const cArr = ca.array
        for (let i = 0; i < pArr.length / 3; i++) {
          const idx = i * 3
          _orbitTempV.set(pArr[idx], pArr[idx+1], pArr[idx+2]).applyMatrix4(ring.matrixWorld)
          const dist = _orbitTempV.distanceTo(camera.position)
          const tDist = Math.max(0, Math.min(1, (dist - 10) / 32.0))
          _orbitTempCol.copy(_orbitNearCol).lerp(_orbitFarCol, tDist * 0.82)
          cArr[idx]=_orbitTempCol.r; cArr[idx+1]=_orbitTempCol.g; cArr[idx+2]=_orbitTempCol.b
        }
        ca.needsUpdate = true
      }
    }
  }

  // 中心恒星淡入（包含核心球体、发光和外光晕）
  if (_starGroup) {
    _starGroup.visible = true
    const pulse = 1 + Math.sin(time * 0.18) * 0.06 + Math.sin(time * 0.33) * 0.04
    
    // 平滑淡入恒星核心
    const coreMesh = _starGroup.children[0]
    if (coreMesh && coreMesh.material) {
      coreMesh.material.opacity = smoothStarWedge
    }
    
    if (_starGlow) {
      _starGlow.material.opacity = smoothStarWedge * 0.30 * pulse
      _starGlow.scale.setScalar(pulse)
    }
    if (_starGroup.userData.haloSprite) {
      _starGroup.userData.haloSprite.material.opacity = smoothStarWedge * 0.55 * pulse
    }
  }

  // 楔形环带渐变淡入（平滑颜色过渡 + 边缘装点曲线）
  const gentlerStarWedge = Math.pow(smoothStarWedge, 2.5)
  const ringOpacity = gentlerStarWedge * 0.85
  for (let ri = 0; ri < _wedgeRings.length; ri++) {
    const rd = _wedgeRings[ri]
    if (rd.isIndividual) {
      rd.outerRingGroup.visible = true
      rd.outerRingGroup.position.copy(_starGroup.position)
      rd.outerRingGroup.rotation.set(rd.tiltX, time * rd.rotSpeed, rd.tiltZ)

      for (const wg of rd.outerWedgeGroups) {
        _ssScratch.setFromMatrixPosition(wg.group.matrixWorld)
        _ssScratch.project(camera)
        const screenDist = Math.hypot(_ssScratch.x, _ssScratch.y)
        // 高阶指数边缘装点：中心→0，边缘→1
        const normDist = Math.min(1.2, screenDist)
        const lensFade = Math.max(0, Math.min(1, Math.pow(normDist / 1.1, 2.5)))
        const finalAlpha = ringOpacity * lensFade
        // 同步缩放材质颜色：黑→白，消除低透明度时的轮廓闪现
        wg.mesh.material.color.setRGB(finalAlpha, finalAlpha, finalAlpha)
        wg.mesh.material.opacity = finalAlpha
        wg.group.rotation.z = time * 0.15 + wg.phase
      }
    } else {
      rd.mesh.visible = true
      rd.mesh.position.copy(_starGroup.position)
      rd.mesh.rotation.set(rd.tiltX, time * rd.rotSpeed, rd.tiltZ)
      rd.mesh.material.color.setRGB(ringOpacity, ringOpacity, ringOpacity)
      rd.mesh.material.opacity = ringOpacity
    }
  }

  const isFocused = _focusedPlanetIdx >= 0
  const targetLabelOpacity = isFocused ? 0 : smoothOrbitFocus * 0.82
  _labelOpacityCurrent += (targetLabelOpacity - _labelOpacityCurrent) * 0.12
  _mainPlanetsPreFiltered.sort((a, b) => _mainPlanetIndices.indexOf(dustParticles.indexOf(a)) - _mainPlanetIndices.indexOf(dustParticles.indexOf(b)))
  for (let t = 0; t < _planetLabels.length && t < _mainPlanetsPreFiltered.length; t++) {
    const label = _planetLabels[t]
    const planet = _mainPlanetsPreFiltered[t]
    label.visible = sp >= GRID_SHIFT_START
    label.position.copy(planet.position)
    label.position.y += 0.45
    label.material.opacity = _labelOpacityCurrent
  }
}

act3.exit = () => {
  for (const line of _orbitLines) { line.visible = false; line.material.opacity = 0 }
  for (const g of _gyroGroups) { g.visible = false; if (g.children[0]) g.children[0].material.opacity = 0 }
  for (const label of _planetLabels) { label.visible = false; label.material.opacity = 0 }
  for (const rd of _wedgeRings) {
    if (rd.isIndividual) rd.outerRingGroup.visible = false
    else rd.mesh.visible = false
  }
  if (_starGroup) {
    _starGroup.visible = false
    const coreMesh = _starGroup.children[0]
    if (coreMesh && coreMesh.material) coreMesh.material.opacity = 0
    if (_starGlow) _starGlow.material.opacity = 0
    if (_starGroup.userData.haloSprite) _starGroup.userData.haloSprite.material.opacity = 0
  }
  if (_focusedPlanetIdx >= 0) {
    _focusedPlanetIdx = -1
    _focusStartTime = 0
    emit('focusChange', false)
  }
}

act3.dispose = () => {
  for (const line of _orbitLines) {
    line.geometry.dispose()
    line.material.dispose()
  }
  _orbitLines = []

  for (const g of _gyroGroups) {
    g.traverse(c => {
      if (c.geometry) c.geometry.dispose()
      if (c.material) c.material.dispose()
    })
  }
  _gyroGroups = []

  for (const sprite of _planetLabels) {
    sprite.material.map.dispose()
    sprite.material.dispose()
  }
  _planetLabels = []

  for (const rd of _wedgeRings) {
    if (rd.isIndividual) {
      for (const wg of rd.outerWedgeGroups) { wg.mesh.material.dispose() }
      if (rd.outerWedgeGroups.length > 0) rd.outerWedgeGroups[0].mesh.geometry.dispose()
      scene.remove(rd.outerRingGroup)
    } else {
      scene.remove(rd.mesh)
      rd.mesh.geometry.dispose()
      if (rd.mesh.material.map) rd.mesh.material.map.dispose()
      rd.mesh.material.dispose()
    }
  }
  _wedgeRings = []

  if (_starGroup) {
    _starGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose()
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
        else c.material.dispose()
      }
    })
    _starGroup = null
    _starGlow = null
  }

  _raycaster = null
  act3Initialized = false
}

// ============================================================
//  ACT MANAGER
// ============================================================
const acts = [act1, act2, act3]
const builtActs = new Set()

const _activeActsCache = []
function resolveActiveActs(sp) {
  _activeActsCache.length = 0
  for (const act of acts) {
    if (sp >= act.start - 0.01 && sp <= act.end + 0.01) {
      if (!builtActs.has(act.name)) {
        if (act.build) act.build()
        builtActs.add(act.name)
      }
      _activeActsCache.push(act)
    }
  }
  return _activeActsCache
}

function animate(time) {
  animationId = requestAnimationFrame(animate)
  const t = time * 0.001
  const sp = props.scrollProgress

  updateTextOffsetCSS(sp)
  sceneApplyWhiteOut(sp)

  if (lighthouseGroup) {
    lighthouseGroup.visible = sp < WHITE_OUT_END
  }

  animateWavesAndLighting(t, sp)
  animateVerticalGrid(sp)
  animateDust(t, sp)
  animateBeam(t, sp)

  const activeActs = resolveActiveActs(sp)
  for (const act of activeActs) {
    const tSp = Math.max(0, Math.min(1, (sp - act.start) / (act.end - act.start)))
    if (act.animate) act.animate(t, tSp, sp)
  }

  updateCameraFocus(sp, t)

  renderer.render(scene, camera)
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

const onMouseMoveGlobal = (e) => {
  _mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1
  _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1
}

const onClickCanvas = (e) => {
  const sp = props.scrollProgress
  if (sp < GRID_SHIFT_START) return

  if (_focusedPlanetIdx >= 0) {
    _focusStartTime = performance.now() * 0.001
  }

  const rect = canvasRef.value.getBoundingClientRect()
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

  let bestDist = 1e9, bestIdx = -1
  for (let i = 0; i < dustParticles.length; i++) {
    const p = dustParticles[i]
    if (!p.userData.isMainPlanet) continue
    _dustProjectScratch.copy(p.position).project(camera)
    const dx = (_dustProjectScratch.x - ndcX) * (camera.aspect || 1)
    const dy = _dustProjectScratch.y - ndcY
    const dist = Math.hypot(dx, dy)
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }

  if (bestDist < 0.16 && bestIdx >= 0) {
    const trackIdx = _mainPlanetIndices.indexOf(bestIdx)
    if (trackIdx >= 0 && trackIdx < _planetLinks.length) {
      if (_focusedPlanetIdx === bestIdx) {
        const linkUrl = _planetLinks[trackIdx].url
        if (linkUrl) window.open(linkUrl, '_blank', 'noopener')
      } else {
        _focusedPlanetIdx = bestIdx
        _focusStartTime = performance.now() * 0.001 
        _focusOrbitAngle = 0
        emit('focusChange', true)
      }
    }
  } else {
    _focusedPlanetIdx = -1
    emit('focusChange', false)
  }
}

let _lastCssSpKey = -1
function updateTextOffsetCSS(sp) {
  const key = Math.round(sp * 1000)
  if (key === _lastCssSpKey) return
  _lastCssSpKey = key
  const progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress = progress * progress * (3 - 2 * progress)
  const translateUp = -90 * smoothProgress
  document.documentElement.style.setProperty('--text-offset-y', `${translateUp}px`)
}

function captureLighthouse() {
  if (!lighthouseGroup || !renderer) return null

  const captureW = 512, captureH = 1024
  const offRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  offRenderer.setSize(captureW, captureH)
  offRenderer.setPixelRatio(1)
  offRenderer.setClearColor(0x000000, 0)

  const clone = lighthouseGroup.clone(true)
  const tempScene = new THREE.Scene()

  clone.position.set(0, -0.965, 0)
  clone.scale.copy(lighthouseGroup.scale)
  tempScene.add(clone)

  tempScene.add(new THREE.AmbientLight('#ffffff', 1.8))
  const key = new THREE.DirectionalLight('#ffffff', 2.2)
  key.position.set(4, 6, 8)
  tempScene.add(key)
  const fill = new THREE.DirectionalLight('#c8d6ff', 1.0)
  fill.position.set(-4, 2, 4)
  tempScene.add(fill)

  const capCam = new THREE.PerspectiveCamera(25, captureW / captureH, 0.1, 50)
  capCam.position.set(0, 0, 9)
  capCam.lookAt(0, 0, 0)

  offRenderer.render(tempScene, capCam)
  const dataUrl = offRenderer.domElement.toDataURL('image/png')

  offRenderer.dispose()
  clone.traverse(c => {
    if (c.geometry) c.geometry.dispose()
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
      else c.material.dispose()
    }
  })

  return dataUrl
}

defineExpose({ captureLighthouse })

onMounted(() => {
  const w = window.innerWidth, h = window.innerHeight
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(40, w/h, 0.1, 150)
  camera.position.set(0, 0.25, 8)
  camera.lookAt(0, -0.65, -24)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: false, antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  if (act1.build) act1.build()
  builtActs.add(act1.name)

  let prevActiveNames = []
  const _activeNamesCache = []
  const origAnimate = animate
  animate = function(time) {
    const sp = props.scrollProgress
    _activeNamesCache.length = 0
    const activeNames = _activeNamesCache
    for (const act of acts) {
      if (sp >= act.start - 0.01 && sp <= act.end + 0.01) activeNames.push(act.name)
    }
    for (const act of acts) {
      if (prevActiveNames.includes(act.name) && !activeNames.includes(act.name)) {
        if (act.exit && builtActs.has(act.name)) act.exit()
      }
    }
    prevActiveNames = activeNames.slice()
    origAnimate(time)
  }

  animationId = requestAnimationFrame(animate)
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMoveGlobal)
  canvasRef.value.addEventListener('click', onClickCanvas)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMoveGlobal)
  canvasRef.value?.removeEventListener('click', onClickCanvas)
  
  renderer?.dispose()
  scene?.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else obj.material.dispose()
    }
  })
})
</script>

<template>
  <div style="position:fixed;inset:0;z-index:0">
    <canvas ref="canvasRef" style="position:absolute;inset:0" />
    <canvas ref="invertCanvasRef" style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:difference;" />
    <canvas ref="overlayRef" style="position:absolute;inset:0;pointer-events:none" />
  </div>
</template>