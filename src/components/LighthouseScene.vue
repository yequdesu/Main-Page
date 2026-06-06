<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const emit = defineEmits(['focusChange'])

const canvasRef = ref(null)

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

// 统一的场景中心 Z 轴坐标，使灯塔与轨道完美契合
const SCENE_CENTER_Z      = -16.0 

// ============================================================
//  ACT 3 CONSTANTS
// ============================================================
const ORBIT_COUNT = 3
const ORBIT_RADII = [3.6, 5.0, 6.4]
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

// ---- pre-allocated reusable objects for hot paths (eliminates per-frame GC) ----
const _bgBaseColor = new THREE.Color('#050811')
const _bgTargetColor = new THREE.Color('#f1f5f9')
const _bgLerpColor = new THREE.Color()
const _dustProjectScratch = new THREE.Vector3()
let _mainPlanetsPreFiltered = []

// ============================================================
//  FRAME CACHING GUARDS (Prevents redundant updates in a single frame)
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

  // 关键优化：调整灯塔位置至 SCENE_CENTER_Z，使其处于公转轨道的中心
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
    
    // 大行星开启深度写入，普通行星碎片不开启
    const mat = new THREE.MeshBasicMaterial({ 
      color:'#f0f8ff', 
      transparent:true, 
      opacity:0, 
      depthWrite: isMain, 
      depthTest:true 
    })
    const p = new THREE.Mesh(geo, mat)
    
    // 大行星渲染层级为 1，小粒子为 2
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
      p.userData.orbitSpeed = -0.04 - trackIdx * 0.015
      p.userData._baseSpeed = p.userData.orbitSpeed
      p.userData.scaleMult  = 2.4 + trackIdx * 0.2
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
      const dx = (_scratch.x - _mouseNDC.x) * (window.innerWidth / window.innerHeight)
      const dy = _scratch.y - _mouseNDC.y
      const dist = Math.hypot(dx, dy)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    // Hysteresis: harder to exit than enter, prevents focus-defocus oscillation
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

  // 关键优化：将公转运动中心 Z 轴设为 SCENE_CENTER_Z
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

    const effectiveSpeed = d._baseSpeed * (1.0 - d.hoverFactor * 0.80)
    d.orbitAngle += dt * effectiveSpeed

    const wobbleR = d.isMainPlanet ? d.orbitR : d.orbitR + Math.sin(time * d.wobbleFreq + d.ph) * d.wobbleAmp
    const ox = cx + Math.cos(d.orbitAngle) * wobbleR
    const oy = cy
    const oz = cz + Math.sin(d.orbitAngle) * wobbleR

    p.position.set(
      THREE.MathUtils.lerp(bx, ox, smoothProgress3),
      THREE.MathUtils.lerp(by, oy, smoothProgress3),
      THREE.MathUtils.lerp(bz, oz, smoothProgress3)
    )

    // Non-planet dust uses fixed reference distance so camera focus doesn't resize them
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
    
    // 关键优化：大行星（d.isMainPlanet）在 Act 3 中过渡为完全不透明（1.0）
    const opacityAct3 = d.isMainPlanet ? 1.0 : 0.55

    let currentOpacity = THREE.MathUtils.lerp(opacityAct1, opacityAct2, wof)
    p.material.opacity = THREE.MathUtils.lerp(currentOpacity, opacityAct3, smoothProgress3)

    _colorAct2.set(d.grayHex)
    _currentColor.copy(_colorAct1).lerp(_colorAct2, wof).lerp(_colorAct3, smoothProgress3)
    p.material.color.copy(_currentColor)
  }
}

// ---- camera focus system (Act 3 planet hover) ----
function updateCameraFocus(sp) {
  const isAct3 = sp >= GRID_SHIFT_START
  if (!isAct3) {
    if (_focusedPlanetIdx >= 0) {
      _focusedPlanetIdx = -1
      emit('focusChange', false)
    }
    return
  }

  const focusedPlanet = (_focusedPlanetIdx >= 0) ? dustParticles[_focusedPlanetIdx] : null

  if (focusedPlanet && focusedPlanet.userData.isMainPlanet) {
    // Framing: star (right half) ← camera → planet (left side)
    // Camera behind planet (away from star), shifted left
    _camToStar.subVectors(_starPos, focusedPlanet.position).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()

    const orbitR = focusedPlanet.userData.orbitR || 4.5
    _targetCamPos.copy(focusedPlanet.position)
      .addScaledVector(_camToStar, -orbitR * 1.35)  // behind planet
      .addScaledVector(_camLeftDir, orbitR * 0.55)   // shift left

    // Look between star and planet, biased 60% toward star
    _targetLookAt.copy(focusedPlanet.position)
      .addScaledVector(_camToStar, orbitR * 0.55)
  } else {
    // Return to default
    _targetCamPos.copy(_defaultCamPos)
    _targetLookAt.copy(_defaultLookAt)
  }

  // Smooth lerp camera position
  camera.position.lerp(_targetCamPos, 0.06)
  _currentLookAt.lerp(_targetLookAt, 0.06)
  camera.lookAt(_currentLookAt)
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
const act3 = { name: 'ContentPhase', start: GRID_SHIFT_START, end: 1.00 }

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
let _labelOpacityCurrent = 0
let _raycaster = null
let _lastTimeSec = 0

const _planetLinks = [
  { label: 'FS',     accent: '#94a3b8', url: 'https://fs.yequdesu.top' },
  { label: 'Code',   accent: '#0ea5e9', url: 'https://code.yequdesu.top' },
  { label: 'GitHub', accent: '#818cf8', url: 'https://github.com/yequdesu' },
]

function createPlanetLabel(text, accentColor) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  // Pill background
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

  // Subtle border
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
    const r = ORBIT_RADII[t]
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0, depthWrite: false, depthTest: true })
    const line = new THREE.Line(geo, mat)
    
    // 关键优化：将轨道中心 Z 轴对齐到灯塔中心 SCENE_CENTER_Z
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
    const ringMat = new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0, depthWrite: false, depthTest: true })
    const ring = new THREE.LineLoop(ringGeo, ringMat)
    const group = new THREE.Group()
    group.add(ring)
    
    // 关键优化：外环轨道中心也对齐到灯塔中心 SCENE_CENTER_Z
    group.position.set(0, -1.0, SCENE_CENTER_Z)
    group.userData = { rotSpeed: 0.08 + g * 0.05 }
    
    ring.renderOrder = 2
    group.renderOrder = 2
    
    scene.add(group)
    _gyroGroups.push(group)
  }

  // --- central star (sun) at orbit center ---
  _starGroup = new THREE.Group()
  _starGroup.position.set(0, -1.0, SCENE_CENTER_Z)
  _starGroup.renderOrder = 1

  // Core: warm bright sphere
  const coreGeo = new THREE.SphereGeometry(0.42, 32, 32)
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff8e7' })
  const core = new THREE.Mesh(coreGeo, coreMat)
  _starGroup.add(core)

  // Inner glow: larger transparent envelope
  const glowGeo = new THREE.SphereGeometry(0.70, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#ffe8c0',
    transparent: true,
    opacity: 0.30,
    depthWrite: false
  })
  _starGlow = new THREE.Mesh(glowGeo, glowMat)
  _starGroup.add(_starGlow)

  // Outer halo: sprite for soft radial falloff
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
  const progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress = progress * progress * (3 - 2 * progress)

  for (const line of _orbitLines) {
    line.material.opacity = smoothProgress * 0.35
  }

  for (const g of _gyroGroups) {
    g.rotation.y += g.userData.rotSpeed * 0.016
    if (g.children[0]) g.children[0].material.opacity = smoothProgress * 0.28
  }

  // Star: fade in, subtle pulse
  if (_starGroup) {
    const pulse = 1 + Math.sin(time * 1.8) * 0.06 + Math.sin(time * 3.3) * 0.04
    if (_starGlow) {
      _starGlow.material.opacity = smoothProgress * 0.30 * pulse
      _starGlow.scale.setScalar(pulse)
    }
    if (_starGroup.userData.haloSprite) {
      _starGroup.userData.haloSprite.material.opacity = smoothProgress * 0.55 * pulse
    }
  }

  const isFocused = _focusedPlanetIdx >= 0
  const targetLabelOpacity = isFocused ? 0 : smoothProgress * 0.82
  _labelOpacityCurrent += (targetLabelOpacity - _labelOpacityCurrent) * 0.12
  _mainPlanetsPreFiltered.sort((a, b) => _mainPlanetIndices.indexOf(dustParticles.indexOf(a)) - _mainPlanetIndices.indexOf(dustParticles.indexOf(b)))
  for (let t = 0; t < _planetLabels.length && t < _mainPlanetsPreFiltered.length; t++) {
    const label = _planetLabels[t]
    const planet = _mainPlanetsPreFiltered[t]
    label.position.copy(planet.position)
    label.position.y += 0.45
    label.material.opacity = _labelOpacityCurrent
  }
}

act3.exit = () => {}

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

  // Hide 3D lighthouse once white-out fully covers it
  if (lighthouseGroup) {
    lighthouseGroup.visible = sp < WHITE_OUT_END
  }

  animateWavesAndLighting(t, sp)
  animateVerticalGrid(sp)
  animateDust(t, sp)
  animateBeam(t, sp)
  updateCameraFocus(sp)

  const activeActs = resolveActiveActs(sp)
  for (const act of activeActs) {
    const tSp = Math.max(0, Math.min(1, (sp - act.start) / (act.end - act.start)))
    if (act.animate) act.animate(t, tSp, sp)
  }

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
  if (sp < GRID_SHIFT_START || !_raycaster) return

  const rect = canvasRef.value.getBoundingClientRect()
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

  _clickNDC.set(ndcX, ndcY)
  _raycaster.setFromCamera(_clickNDC, camera)
  const mainPlanets = dustParticles.filter(p => p.userData.isMainPlanet)
  const hits = _raycaster.intersectObjects(mainPlanets, false)
  if (hits.length > 0) {
    const planet = hits[0].object
    const planetIdx = dustParticles.indexOf(planet)
    const trackIdx = _mainPlanetIndices.indexOf(planetIdx)
    if (trackIdx >= 0 && trackIdx < _planetLinks.length) {
      if (_focusedPlanetIdx === planetIdx) {
        // Already focused — open URL
        window.open(_planetLinks[trackIdx].url, '_blank', 'noopener')
      } else {
        // Focus this planet
        _focusedPlanetIdx = planetIdx
        emit('focusChange', true)
      }
    }
  } else {
    // Clicked empty space — unfocus
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

  // Center lighthouse clone at origin (includes base/foundation)
  // Local y extent after 0.7 scale: ~-0.63 (foundation) to ~2.56 (spire tip)
  // Center = (-0.63 + 2.56) / 2 ≈ 0.965
  clone.position.set(0, -0.965, 0)
  clone.scale.copy(lighthouseGroup.scale)
  tempScene.add(clone)

  // Lighting for MeshStandardMaterials
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

  // Cleanup
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
    prevActiveNames = activeNames
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
  </div>
</template>