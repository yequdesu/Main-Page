<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const canvasRef = ref(null)

// ============================================================
//  GLOBALS — shared by all acts, owned by the scene manager
// ============================================================
let renderer, scene, camera, animationId

// ============================================================
//  SHARED CONSTANTS — act boundary thresholds
// ============================================================
const WHITE_OUT_THRESHOLD = 0.40 
const WHITE_OUT_END      = 0.55 
const GRID_START         = 0.45 
const VERTICAL_START     = 0.58 
const TEXT_START         = 0.70 
const GRID_SHIFT_START   = 0.85 
const IDLE_RESET_DELAY   = 1.5

// ============================================================
//  ACT 3 CONSTANTS — (修复：补充缺失的全局定义)
// ============================================================
const ORBIT_COUNT = 3
const ORBIT_RADII = [3.6, 5.0, 6.4]
let _mainPlanetIndices = []

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
//  STATE CONTEXT — carries data between acts
// ============================================================
class StateContext {
  constructor() { this._store = new Map() }
  set(key, val)  { this._store.set(key, val) }
  get(key)       { return this._store.get(key) }
  has(key)       { return this._store.has(key) }
}

const ctx = new StateContext()

// ============================================================
//  VOLUMETRIC BEAM SHADER (shared by Act 1 beam build)
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
  const baseBg = new THREE.Color('#050811')
  const targetBg = new THREE.Color('#f1f5f9') 
  scene.background = baseBg.clone().lerp(targetBg, wof)
  if (scene.fog) {
    scene.fog.color = scene.background
    scene.fog.density = 0.02 + wof * 0.10
  }
  if (_ambientLightRef) _ambientLightRef.intensity = 1.4 + wof * 3.5
}

// ============================================================
//  ACT 1  OCEAN VOYAGE  (sp 0.00 → 0.45)
// ============================================================
const act1 = { name: 'OceanVoyage', start: 0.00, end: GRID_START }

let lighthouseGroup, beamPivot
let beamCones = [], beamRays = [], beamGlow = null
let oceanLines = []
let waveData = [], waveBaseColors = []
let dustGeo1, dustParticles1 = []

let baseBeamAngle = 0, returnToIdleTime = 0, idlePhase = 0
let scrollStartAngle = 0, scrollStartAngleX = 0
let wasScrolling = false

act1.build = () => {
  buildSky()
  buildOcean()
  buildLighthouse()
  buildLightBeam()
  buildDustAct1()
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
    railG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.15,6), metalMat)
      .position.set(Math.cos(a)*0.33,0.075,Math.sin(a)*0.33))
  }
  lighthouseGroup.add(railG)

  const lf = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.06,16), metalMat)
  lf.position.y=2.74; lighthouseGroup.add(lf)

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.21,0.44,16,1,true),
    new THREE.MeshStandardMaterial({ color:'#fff', roughness:0.1, metalness:0.9,
      emissive:'#fff', emissiveIntensity:1.0, side:THREE.DoubleSide, transparent:true, opacity:0.2 }))
  glass.position.y=2.96; lighthouseGroup.add(glass)

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07,12,12), glowMat)
  bulb.position.y=2.96; lighthouseGroup.add(bulb)

  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2
    lighthouseGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.44,6), metalMat)
      .position.set(Math.cos(a)*0.22,2.96,Math.sin(a)*0.22))
  }

  lighthouseGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.04,16), metalMat).position.set(0,3.18,0))
  lighthouseGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.22,16,12,0,Math.PI*2,0,Math.PI/2), metalMat).position.set(0,3.20,0))
  lighthouseGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.06,12), metalMat).position.set(0,3.42,0))

  const brass = new THREE.MeshStandardMaterial({ color:'#e5c158', roughness:0.2, metalness:0.9 })
  lighthouseGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.035,12,12), brass).position.set(0,3.47,0))
  lighthouseGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.012,0.35,8), metalMat).position.set(0,3.65,0))

  lighthouseGroup.position.set(0,-2.5,-32)
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
    beamPivot.add(cone); beamCones.push(cone)
  })

  function makeRay(dx) {
    const pts=[new THREE.Vector3(0,0,0), new THREE.Vector3(dx*4.5,0,55)]
    const g=new THREE.BufferGeometry().setFromPoints(pts)
    g.setAttribute('color',new THREE.BufferAttribute(new Float32Array([1,1,1,0.3,0.3,0.3]),3))
    return new THREE.Line(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.45,depthWrite:false,blending:THREE.AdditiveBlending}))
  }
  beamPivot.add(makeRay(-1)); beamPivot.add(makeRay(1))
  beamRays.push(beamPivot.children[beamPivot.children.length-2], beamPivot.children[beamPivot.children.length-1])

  beamGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,16), new THREE.MeshBasicMaterial({color:'#fff',transparent:true,opacity:0.95}))
  beamPivot.add(beamGlow)
}

function buildDustAct1() {
  dustGeo1 = new THREE.SphereGeometry(0.015, 10, 8)
  const count = 135
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color:'#f0f8ff', transparent:true, opacity:0, depthWrite:false })
    const p = new THREE.Mesh(dustGeo1, mat)
    const t = Math.random()
    const worldOrigin = new THREE.Vector3()
    lighthouseGroup.getWorldPosition(worldOrigin)
    worldOrigin.y += 2.96 * lighthouseGroup.scale.y
    const zDist = 1 + t * 41
    const maxR = (zDist / 42) * 7.5 + 0.2
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR
    p.position.set(worldOrigin.x+Math.cos(angle)*r, worldOrigin.y+(Math.random()-0.5)*maxR*0.6, worldOrigin.z+zDist)
    p.userData = {
      wx:p.position.x, wy:p.position.y, wz:p.position.z,
      dx:(Math.random()-0.5)*0.15, dy:(Math.random()-0.5)*0.1+0.06, dz:(Math.random()-0.5)*0.08,
      ph:Math.random()*Math.PI*2, scale:0.4+Math.random()*0.8
    }
    scene.add(p)
    dustParticles1.push(p)
  }
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
  if (beamPivot && !beamPivot.visible) beamPivot.visible = true
  if (_ptLightRef && _ptLightRef.intensity === 0) _ptLightRef.intensity = 3.0
  animateBeam(time, sp)
  if (sp < GRID_START) animateWavesAndLighting(time, sp)
  animateDustAct1(time, sp)
}

function animateWavesAndLighting(time, sp) {
  const skipHL = sp >= WHITE_OUT_THRESHOLD
  let beamOrigin, beamDir
  if (!skipHL && beamPivot) {
    beamOrigin = new THREE.Vector3(); beamPivot.getWorldPosition(beamOrigin)
    beamDir = new THREE.Vector3(0,0,1).applyQuaternion(beamPivot.quaternion).normalize()
  }
  for (let i = 0; i < oceanLines.length; i++) {
    const line = oceanLines[i], data = waveData[i], bc = waveBaseColors[i]
    const pa = line.geometry.attributes.position, ca = line.geometry.attributes.color
    const pArr = pa.array, cArr = ca.array
    for (let j = 0; j <= data.segCount; j++) {
      const idx = j*3, x = pArr[idx]
      const t = time * data.speed + data.phase
      const y = data.baseY + Math.sin(x*data.frequency+t)*data.amplitude + Math.sin(x*data.frequency*1.8+t*1.2)*data.amplitude*0.4
      pArr[idx+1] = y
      if (skipHL) { cArr[idx]=bc.r; cArr[idx+1]=bc.g; cArr[idx+2]=bc.b }
      else if (beamDir) {
        const vx=x-beamOrigin.x, vy=y-beamOrigin.y, vz=data.z-beamOrigin.z
        const proj=vx*beamDir.x+vy*beamDir.y+vz*beamDir.z
        const localX=vx*beamDir.z-vz*beamDir.x
        const beamR=1.2+Math.max(0,proj)*0.15
        const distSq=(localX*localX)/(beamR*beamR)+(vy*vy)/1.5
        let di=Math.exp(-distSq*0.9)
        di*=Math.max(0,Math.min(1,(proj+4)/8))
        di*=Math.max(0,1-(Math.max(0,proj)/48))
        let li=di*1.5
        if(beamDir.z>0&&vz>0) li+=di*Math.exp(-(x*x)/7)*beamDir.z*1.3
        const hR=0.92,hG=0.97,hB=1.0
        cArr[idx]=bc.r+(hR-bc.r)*li*0.95; cArr[idx+1]=bc.g+(hG-bc.g)*li*0.95; cArr[idx+2]=bc.b+(hB-bc.b)*li*0.95
      }
    }
    pa.needsUpdate=true; ca.needsUpdate=true
  }
}

function animateBeam(time, sp) {
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
  const wof=Math.max(0,Math.min(1,(sp-WHITE_OUT_THRESHOLD)/(WHITE_OUT_END-WHITE_OUT_THRESHOLD)))
  const beamFade = Math.max(0, 1.0 - wof * 1.5)
  const baseVals=[0.85,0.45,0.15]
  beamCones.forEach((c,i)=>{ c.material.uniforms.uOpacity.value=(baseVals[i]+beamBoost*(i===2?1.8:1.2)+wof*1.5)*beamMult*beamFade })
  beamRays.forEach(r=>{ r.material.opacity=(0.45+sp*0.35+wof*0.5)*beamMult*beamFade })
  if(beamGlow) beamGlow.material.opacity = 0.95 * beamFade
  if(_ptLightRef) _ptLightRef.intensity=(3.0+Math.pow(sp,1.5)*12+wof*50)*beamMult*beamFade
}

function animateDustAct1(time, sp) {
  if(!beamPivot||!camera) return
  const t=time
  const bwo=new THREE.Vector3(); beamPivot.getWorldPosition(bwo)
  const beamDir=new THREE.Vector3(0,0,1).applyQuaternion(beamPivot.quaternion).normalize()
  for(const p of dustParticles1){
    const d=p.userData
    p.position.set(d.wx+Math.sin(t*0.4+d.ph)*0.25, d.wy+Math.sin(t*0.3+d.ph+1)*0.18, d.wz+Math.sin(t*0.25+d.ph+2)*0.15)
    const toP=new THREE.Vector3().subVectors(p.position,bwo), proj=toP.dot(beamDir)
    let bf=0
    if(proj>0&&proj<45){ const pp=bwo.clone().addScaledVector(beamDir,proj); const dist=p.position.distanceTo(pp); const br=(proj/45)*5.5+0.2; if(dist<br) bf=Math.pow(1-dist/br,1.8) }
    const cd=p.position.distanceTo(camera.position), ds=22/Math.max(5,cd)
    p.scale.setScalar(d.scale*(0.4+bf*2)*ds)
    let fo=(0.14+bf*0.76)*(0.35+sp*0.65)
    if(cd<7) fo*=Math.max(0,(cd-2.5)/4.5)
    if(cd>42) fo*=Math.max(0,1-(cd-42)/10)
    const dustOut=1-Math.max(0,Math.min(1,(sp-WHITE_OUT_THRESHOLD)/(WHITE_OUT_END-WHITE_OUT_THRESHOLD)))
    p.material.opacity=Math.max(0,fo*dustOut)
  }
}

act1.exit = () => {
  ctx.set('oceanLines', oceanLines)
  ctx.set('waveData', waveData)
  ctx.set('waveBaseColors', waveBaseColors)
  ctx.set('dustConfig', { count:135, color:'#f0f8ff', baseOpacity:0.14, baseRadius:0.015 })
  ctx.set('beamFinalAngleY', beamPivot ? beamPivot.rotation.y : 0)
  ctx.set('beamFinalAngleX', beamPivot ? beamPivot.rotation.x : -0.02)
  const finalPositions = dustParticles1.map(p => ({
    x: p.position.x, y: p.position.y, z: p.position.z,
    ph: p.userData.ph, scale: p.userData.scale
  }))
  ctx.set('dustEndPositions', finalPositions)
  if (_ptLightRef) _ptLightRef.intensity = 0
}

act1.dispose = () => {}

// ============================================================
//  ACT 2  GRID PLANARIZATION  (sp 0.40 → 0.85)
//  平面网格在此时完全稳定，供显示核心内容/文字
// ============================================================
const act2 = { name: 'GridTransition', start: WHITE_OUT_THRESHOLD, end: GRID_SHIFT_START }

let gridVerticalLines = []
let horizontalFlattened = false
let verticalDone = false
let dustParticles2 = []

act2.build = () => {
  buildVerticalGridLines()
  buildDustAct2()
}

function buildDustAct2() {
  const dc = ctx.get('dustConfig') || { count: 135, color: '#f0f8ff', baseOpacity: 0.14, baseRadius: 0.015 }
  const geo = new THREE.SphereGeometry(dc.baseRadius, 10, 8)
  const source = dustParticles1.length > 0 ? dustParticles1 : []
  const count = source.length || dc.count

  for (let i = 0; i < count; i++) {
    const gray = Math.floor(100 + Math.random() * 60)
    const hex = '#' + gray.toString(16).padStart(2,'0').repeat(3)
    const mat = new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0,
      depthTest: true, depthWrite: false
    })
    const p = new THREE.Mesh(geo, mat)

    if (source[i]) {
      const s = source[i]
      p.position.copy(s.position)
      p.scale.copy(s.scale)
      p.userData = {
        wx: s.userData.wx, wy: s.userData.wy, wz: s.userData.wz,
        ph: s.userData.ph,
        scale: s.userData.scale,
        visualScale: s.scale.x,
        captureScale: s.scale.x,
        dx: s.userData.dx, dy: s.userData.dy, dz: s.userData.dz
      }
      p.userData.sizeBoost = Math.random() < 0.60
        ? 1.5 + Math.random() * 2.5   
        : 0.7 + Math.random() * 0.8   
    } else {
      p.position.set((Math.random()-0.5)*28, -3+Math.random()*7, -3+Math.random()*7)
      p.userData = {
        wx:p.position.x, wy:p.position.y, wz:p.position.z,
        ph:Math.random()*Math.PI*2, scale:0.25+Math.random()*0.55,
        dx:(Math.random()-0.5)*0.12, dy:(Math.random()-0.5)*0.08+0.04, dz:(Math.random()-0.5)*0.06,
        sizeBoost: 0.8 + Math.random() * 2.0
      }
    }
    scene.add(p)
    dustParticles2.push(p)
  }
}

function buildVerticalGridLines() {
  if (gridVerticalLines.length > 0) return
  const totalLines=28, zStart=-52, zEnd=12, baseY=-2.5
  for(let i=0;i<totalLines;i++){
    const x=-28+(i/(totalLines-1))*56
    const pts=[new THREE.Vector3(x,baseY,zStart), new THREE.Vector3(x,baseY,zStart)]
    const g=new THREE.BufferGeometry().setFromPoints(pts)
    const nearColor = new THREE.Color('#0f172a')
    const farColor  = new THREE.Color('#e2e8f0')
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
    scene.add(line)
    gridVerticalLines.push({ line, x, baseY, zStart, zEnd, staggerOffset: Math.random()*0.45 })
  }
}

act2.animate = (time, tSp, sp) => {
  const gridFactor = Math.max(0, Math.min(1, (sp - GRID_START) / (VERTICAL_START - GRID_START)))
  const vertFactor = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))

  // Phase 1 — flatten waves
  if (!horizontalFlattened) {
    const oceanLines = ctx.get('oceanLines')
    const waveData   = ctx.get('waveData')
    const waveBC     = ctx.get('waveBaseColors')
    if (oceanLines && waveData) {
      const targetCol = new THREE.Color('#94a3b8')
      for (let i = 0; i < oceanLines.length; i++) {
        const line = oceanLines[i], data = waveData[i], bc = waveBC[i]
        const pa = line.geometry.attributes.position, ca = line.geometry.attributes.color
        const pArr = pa.array, cArr = ca.array
        for (let j = 0; j <= data.segCount; j++) {
          const idx = j * 3
          const x = (j / data.segCount - 0.5) * data.span * 2
          const waveY = data.baseY + Math.sin(x*data.frequency+time*data.speed+data.phase)*data.amplitude + Math.sin(x*data.frequency*1.8+(time*data.speed+data.phase)*1.2)*data.amplitude*0.4
          pArr[idx+1] = THREE.MathUtils.lerp(waveY, data.baseY, gridFactor)
          cArr[idx]=THREE.MathUtils.lerp(bc.r,targetCol.r,gridFactor)
          cArr[idx+1]=THREE.MathUtils.lerp(bc.g,targetCol.g,gridFactor)
          cArr[idx+2]=THREE.MathUtils.lerp(bc.b,targetCol.b,gridFactor)
        }
        pa.needsUpdate = true; ca.needsUpdate = true
        line.material.opacity = THREE.MathUtils.lerp(data.opacity, 0.45, gridFactor)
      }
    }
    if (gridFactor >= 1.0) horizontalFlattened = true
  }
  if (gridFactor < 1.0) horizontalFlattened = false

  // Phase 2 — vertical lines
  if (vertFactor > 0 && !verticalDone) {
    for (const vd of gridVerticalLines) {
      const lp = Math.max(0, Math.min(1, (vertFactor - vd.staggerOffset) / 0.55))
      if (lp <= 0) { vd.line.material.opacity = 0; continue }
      const curZ = THREE.MathUtils.lerp(vd.zStart, vd.zEnd, lp)
      const pArr = vd.line.geometry.attributes.position.array
      pArr[5] = curZ
      vd.line.geometry.attributes.position.needsUpdate = true
      vd.line.material.opacity = Math.min(0.75, lp * 0.75)
    }
    if (vertFactor >= 1.0) verticalDone = true
  }
  if (vertFactor < 1.0) verticalDone = false

  // Dust — drift
  {
    const tSec = time
    for (const p of dustParticles2) {
      const d = p.userData
      p.position.set(
        d.wx + Math.sin(tSec * 0.4 + d.ph) * 0.25,
        d.wy + Math.sin(tSec * 0.3 + d.ph + 1) * 0.18,
        d.wz + Math.sin(tSec * 0.25 + d.ph + 2) * 0.15
      )
      const cd = p.position.distanceTo(camera.position)
      const ds = 22 / Math.max(5, cd)
      const targetScale = d.scale * 0.7 * (d.sizeBoost || 1.0) * ds
      const fadeIn = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
      p.scale.setScalar(THREE.MathUtils.lerp(d.captureScale || targetScale, targetScale, fadeIn))
      p.material.opacity = fadeIn * 0.4
    }
  }
}

act2.exit = () => {
  ctx.set('gridVerticalLines', gridVerticalLines)
}

act2.dispose = () => {}

// ============================================================
//  ACT 3  DOUBLE RING & GRID DESCENT  (sp 0.85 → 1.00)
// ============================================================
const act3 = { name: 'ContentPhase', start: GRID_SHIFT_START, end: 1.00 }

let act3Initialized = false
let _act3GridBaseY = null
let _mouseNDC = { x: 999, y: 999 }
let _ringFreeze = 0          
let _hoveredIdx = -1
let _onMouseMove3 = null

let _orbitLines = []
let _lastTimeSec = 0

act3.build = () => {
  if (act3Initialized || dustParticles2.length === 0) return

  // 选出最大的 3 颗作为主行星
  const sorted = dustParticles2.map((p, i) => ({
    idx: i,
    size: p.userData.scale * (p.userData.sizeBoost || 1.0)
  }))
  sorted.sort((a, b) => b.size - a.size)
  _mainPlanetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

  dustParticles2.forEach((p, idx) => {
    const d = p.userData
    d.orbitAngle = Math.random() * Math.PI * 2
    const isMain = _mainPlanetIndices.includes(idx)
    d.isMainPlanet = isMain
    d.isOuter = true

    if (isMain) {
      const trackIdx = _mainPlanetIndices.indexOf(idx)
      d.orbitR     = ORBIT_RADII[trackIdx]
      d.orbitSpeed = -0.04 - trackIdx * 0.015
      d._baseSpeed = d.orbitSpeed
      d.scaleMult  = 3.5 + trackIdx * 0.3
      d.isNavigationElement = true
      p.name = `planet_${trackIdx}`
    } else {
      d.orbitR     = 2.5 + Math.random() * 4.5
      d.orbitSpeed = -(0.03 + Math.random() * 0.08)
      d._baseSpeed = d.orbitSpeed
      d.scaleMult  = 0.8 + Math.random() * 1.5
      d.wobbleAmp  = 0.5 + Math.random() * 1.2
      d.wobbleFreq = 0.3 + Math.random() * 0.4
      d.isNavigationElement = false
    }
    d.orbitTilt  = 0
    d.flattenY   = 1.0
    d.orbitPhase = (idx / dustParticles2.length) * Math.PI * 2
  })

  // 三条轨道线
  for (let t = 0; t < ORBIT_COUNT; t++) {
    const r = ORBIT_RADII[t]
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const theta = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0, depthWrite: false })
    const line = new THREE.Line(geo, mat)
    line.position.set(0, -1.0, -8)
    scene.add(line)
    _orbitLines.push(line)
  }

  _onMouseMove3 = (e) => {
    _mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1
    _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1
  }
  window.addEventListener('mousemove', _onMouseMove3)

  _lastTimeSec = 0
  act3Initialized = true
}

act3.animate = (time, tSp, sp) => {
  const tSec = time
  const progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress = progress * progress * (3 - 2 * progress)
  const isFullyFormed = progress >= 0.95

  // 计算帧间时间微分（Delta Time）以用于增量物理旋转
  if (_lastTimeSec === 0) _lastTimeSec = tSec
  const dt = Math.min(0.1, tSec - _lastTimeSec) // 限制最大步长防止切屏跳跃
  _lastTimeSec = tSec

  // ── 1. 网格平面随着滑动缓慢下移 ──
  const shiftY = -11 * smoothProgress 

  if (_act3GridBaseY === null) {
    _act3GridBaseY = { ocean: [], vertical: [] }
    // 优化：直接读取 SFC 全局数组变量引用，保证首轮网格线下沉同步率
    if (oceanLines && oceanLines.length > 0) {
      for (const line of oceanLines) {
        _act3GridBaseY.ocean.push(line.geometry.attributes.position.array.slice())
      }
    }
    if (gridVerticalLines && gridVerticalLines.length > 0) {
      for (const vd of gridVerticalLines) {
        _act3GridBaseY.vertical.push(vd.line.geometry.attributes.position.array.slice())
      }
    }
  }

  if (_act3GridBaseY) {
    if (oceanLines && oceanLines.length > 0) {
      for (let i = 0; i < oceanLines.length; i++) {
        const arr = oceanLines[i].geometry.attributes.position.array
        const base = _act3GridBaseY.ocean[i]
        if (!base) continue
        for (let j = 1; j < arr.length; j += 3) {
          arr[j] = base[j] + shiftY
        }
        oceanLines[i].geometry.attributes.position.needsUpdate = true
      }
    }
    if (gridVerticalLines && gridVerticalLines.length > 0) {
      for (let i = 0; i < gridVerticalLines.length; i++) {
        const arr = gridVerticalLines[i].line.geometry.attributes.position.array
        const base = _act3GridBaseY.vertical[i]
        if (!base) continue
        arr[1] = base[1] + shiftY
        arr[4] = base[4] + shiftY
        gridVerticalLines[i].line.geometry.attributes.position.needsUpdate = true
      }
    }
  }

  for (const line of _orbitLines) {
    line.material.opacity = smoothProgress * 0.35
  }

  // ── 2. 双星环重组与鼠标阻尼检测 ──
  let bestDist = 1e9, bestIdx = -1
  const _scratch = new THREE.Vector3()

  if (isFullyFormed) {
    for (let i = 0; i < dustParticles2.length; i++) {
      const p = dustParticles2[i]
      const d = p.userData
      if (!d.isMainPlanet) continue  // 仅主行星可悬停
      
      _scratch.copy(p.position).project(camera)
      const dx = (_scratch.x - _mouseNDC.x) * (window.innerWidth / window.innerHeight)
      const dy = _scratch.y - _mouseNDC.y
      const dist = Math.hypot(dx, dy)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    
    // 微调响应区域
    const nearThreshold = 0.16
    const targetFreeze = bestDist < nearThreshold ? 1.0 : 0
    _ringFreeze += (targetFreeze - _ringFreeze) * 0.08 // 进一步放缓阻尼过度，使其更自然
    _hoveredIdx = bestDist < 0.045 ? bestIdx : -1
  } else {
    _ringFreeze += (0 - _ringFreeze) * 0.15
    _hoveredIdx = -1
  }

  const cx = 0, cy = -1.0, cz = -8

  for (let idx = 0; idx < dustParticles2.length; idx++) {
    const p = dustParticles2[idx]
    const d = p.userData

    // 布朗漂移轨迹
    const bx = d.wx + Math.sin(tSec * 0.4 + d.ph) * 0.25
    const by = d.wy + Math.sin(tSec * 0.3 + d.ph + 1) * 0.18
    const bz = d.wz + Math.sin(tSec * 0.25 + d.ph + 2) * 0.15

    // ── 物理增量积分 ──
    const effectiveSpeed = d.isMainPlanet
      ? d._baseSpeed * (1 - _ringFreeze)
      : d._baseSpeed
    d.orbitAngle += dt * effectiveSpeed

    // 小行星：径向漂移（无固定轨道）
    const wobbleR = d.isMainPlanet
      ? d.orbitR
      : d.orbitR + Math.sin(tSec * d.wobbleFreq + d.ph) * d.wobbleAmp

    const ox = cx + Math.cos(d.orbitAngle) * wobbleR
    const oy = cy
    const oz = cz + Math.sin(d.orbitAngle) * wobbleR

    p.position.set(
      THREE.MathUtils.lerp(bx, ox, smoothProgress),
      THREE.MathUtils.lerp(by, oy, smoothProgress),
      THREE.MathUtils.lerp(bz, oz, smoothProgress)
    )

    const cd = p.position.distanceTo(camera.position)
    const ds = 22 / Math.max(5, cd)
    const baseScale = d.scale * 0.7 * (d.sizeBoost || 1.0) * ds
    const targetScale = baseScale * d.scaleMult

    let finalScale = THREE.MathUtils.lerp(baseScale, targetScale, smoothProgress)
    
    // 悬停仅保留简练的物理放大
    if (idx === _hoveredIdx && d.isMainPlanet && isFullyFormed) {
      finalScale *= 1.35
    }

    p.scale.setScalar(finalScale)
    
    // 颜色配置
    if (d.isMainPlanet) {
      // 主行星：深色，悬停时变亮
      const base = new THREE.Color('#1a1c23')  // 深炭灰
      const hover = new THREE.Color('#0ea5e9') // 悬停亮蓝
      p.material.color.copy(base).lerp(hover, (idx === _hoveredIdx && isFullyFormed) ? 1 : 0)
      p.material.opacity = THREE.MathUtils.lerp(0.40, 0.90, smoothProgress)
    } else {
      // 小行星：淡灰环带
      p.material.color.set('#64748b')
      p.material.opacity = THREE.MathUtils.lerp(0.40, 0.55, smoothProgress)
    }
  }
}

act3.exit = () => {
  _act3GridBaseY = null
}
act3.dispose = () => {
  if (_onMouseMove3) {
    window.removeEventListener('mousemove', _onMouseMove3)
    _onMouseMove3 = null
  }
  for (const line of _orbitLines) {
    line.geometry.dispose()
    line.material.dispose()
  }
  _orbitLines = []
}

// ============================================================
//  ACT MANAGER
// ============================================================
const acts = [act1, act2, act3]
const builtActs = new Set()

function resolveActiveActs(sp) {
  const active = []
  for (const act of acts) {
    if (sp >= act.start - 0.01 && sp <= act.end + 0.01) {
      if (!builtActs.has(act.name)) {
        if (act.build) act.build()
        builtActs.add(act.name)
      }
      active.push(act)
    }
  }
  return active
}

function animate(time) {
  animationId = requestAnimationFrame(animate)
  const t = time * 0.001
  const sp = props.scrollProgress

  sceneApplyWhiteOut(sp)

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

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
  const origAnimate = animate
  animate = function(time) {
    const sp = props.scrollProgress
    const activeNames = []
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
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
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
  <canvas ref="canvasRef" style="position:fixed;inset:0;z-index:0" />
</template>