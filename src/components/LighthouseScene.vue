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
const WHITE_OUT_THRESHOLD = 0.65
const WHITE_OUT_END      = 0.78
const GRID_START         = 0.72
const VERTICAL_START     = 0.86
const TEXT_START         = 0.94
const IDLE_RESET_DELAY   = 1.5

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
//  SCENE MANAGER — white-out transition (cross-act global)
// ============================================================
let _ambientLightRef = null
let _ptLightRef = null

function sceneApplyWhiteOut(sp) {
  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  const baseBg = new THREE.Color('#050811')
  const targetBg = new THREE.Color('#e2e8f0')
  scene.background = baseBg.clone().lerp(targetBg, wof)
  if (scene.fog) {
    scene.fog.color = scene.background
    scene.fog.density = 0.02 + wof * 0.12
  }
  if (_ambientLightRef) _ambientLightRef.intensity = 1.4 + wof * 4.0
}

// ============================================================
//  ACT 1  OCEAN VOYAGE  (sp 0.00 → 0.72)
// ============================================================
const act1 = { name: 'OceanVoyage', start: 0.00, end: GRID_START }

// -- Act 1 local state --
let lighthouseGroup, beamPivot
let beamCones = [], beamRays = []
let oceanLines = []
let waveData = [], waveBaseColors = []
let dustGeo1, dustParticles1 = []

let baseBeamAngle = 0, returnToIdleTime = 0, idlePhase = 0
let scrollStartAngle = 0, scrollStartAngleX = 0
let wasScrolling = false

// ---- Act 1: build ----
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

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22,16,16), new THREE.MeshBasicMaterial({color:'#fff',transparent:true,opacity:0.95}))
  beamPivot.add(glow)
}

function buildDustAct1() {
  dustGeo1 = new THREE.SphereGeometry(0.015, 10, 8) // 更多边数，更圆
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

// ---- Act 1: animate ----
act1.animate = (time, tSp, sp) => {
  animateBeam(time, sp)
  animateWavesAndLighting(time, sp)
  animateDustAct1(time, sp)
}

function animateWavesAndLighting(time, sp) {
  const skipHL = sp >= WHITE_OUT_THRESHOLD
  let beamOrigin, beamDir
  if (!skipHL) {
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
      else {
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
  const baseVals=[0.85,0.45,0.15]
  beamCones.forEach((c,i)=>{ c.material.uniforms.uOpacity.value=(baseVals[i]+beamBoost*(i===2?1.8:1.2)+wof*1.5)*beamMult })
  beamRays.forEach(r=>{ r.material.opacity=(0.45+sp*0.35+wof*0.5)*beamMult })
  if(_ptLightRef) _ptLightRef.intensity=(3.0+Math.pow(sp,1.5)*12+wof*50)*beamMult
}

function animateDustAct1(time, sp) {
  if(!beamPivot||!camera) return
  const t=time*0.001
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

// ---- Act 1: exit → save state for Act 2 ----
act1.exit = () => {
  ctx.set('oceanLines', oceanLines)
  ctx.set('waveData', waveData)
  ctx.set('waveBaseColors', waveBaseColors)
  ctx.set('dustConfig', { count:135, color:'#f0f8ff', baseOpacity:0.14, baseRadius:0.015 })
  ctx.set('beamFinalAngleY', beamPivot ? beamPivot.rotation.y : 0)
  ctx.set('beamFinalAngleX', beamPivot ? beamPivot.rotation.x : -0.02)
}

// ---- Act 1: dispose ----
act1.dispose = () => {
  // Act 1 objects stay in scene for now (ocean lines used by Act 2, lighthouse fades naturally)
  // Full cleanup happens in onUnmounted
}

// ============================================================
//  ACT 2  GRID TRANSITION  (sp 0.65 → 0.94)
// ============================================================
const act2 = { name: 'GridTransition', start: WHITE_OUT_THRESHOLD, end: TEXT_START }

let gridVerticalLines = []
let horizontalFlattened = false
let verticalDone = false
let dustParticles2 = []

// ---- Act 2: build (lazy, called on first enter) ----
act2.build = () => {
  buildVerticalGridLines()
  buildDustAct2()
}

function buildDustAct2() {
  const dc = ctx.get('dustConfig') || { count: 135, color: '#f0f8ff', baseOpacity: 0.14, baseRadius: 0.015 }
  const geo = new THREE.SphereGeometry(dc.baseRadius, 10, 8)
  for (let i = 0; i < dc.count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: dc.color, transparent: true, opacity: 0, depthWrite: false })
    const p = new THREE.Mesh(geo, mat)
    // spread around text area — z ~ -10 to 0, x ~ -12 to 12, y ~ -2 to 3
    const t = Math.random()
    p.position.set(
      (Math.random() - 0.5) * 24,
      -2 + Math.random() * 5,
      -10 + t * 10
    )
    p.userData = {
      wx: p.position.x, wy: p.position.y, wz: p.position.z,
      ph: Math.random() * Math.PI * 2,
      scale: 0.3 + Math.random() * 0.6,
      floatAmp: 0.3 + Math.random() * 0.7,
      floatFreq: 0.3 + Math.random() * 0.5
    }
    scene.add(p)
    dustParticles2.push(p)
  }
}

function buildVerticalGridLines() {
  if (gridVerticalLines.length > 0) return
  const totalLines=18, zStart=-52, zEnd=5, baseY=-2.5
  for(let i=0;i<totalLines;i++){
    const x=-24+(i/(totalLines-1))*48
    const pts=[new THREE.Vector3(x,baseY,zStart), new THREE.Vector3(x,baseY,zStart)]
    const g=new THREE.BufferGeometry().setFromPoints(pts)
    const mat=new THREE.LineBasicMaterial({ color:'#1e293b', transparent:true, opacity:0, depthTest:true, depthWrite:false })
    const line=new THREE.Line(g,mat)
    scene.add(line)
    gridVerticalLines.push({ line, x, baseY, zStart, zEnd, staggerOffset: Math.random()*0.45 })
  }
}

// ---- Act 2: animate ----
act2.animate = (time, tSp, sp) => {
  const gridFactor = Math.max(0, Math.min(1, (sp - GRID_START) / (VERTICAL_START - GRID_START)))
  const vertFactor = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))

  // Phase 1 — flatten ocean waves into straight lines
  if (!horizontalFlattened) {
    const oceanLines = ctx.get('oceanLines')
    const waveData   = ctx.get('waveData')
    const waveBC     = ctx.get('waveBaseColors')
    if (oceanLines && waveData) {
      const targetCol = new THREE.Color('#475569')
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
        line.material.opacity = THREE.MathUtils.lerp(data.opacity, 0.35, gridFactor)
      }
    }
    if (gridFactor >= 1.0) horizontalFlattened = true
  }
  if (gridFactor < 1.0) horizontalFlattened = false

  // Phase 2 — vertical lines fade in (simplified, no droplets)
  if (vertFactor > 0 && !verticalDone) {
    for (const vd of gridVerticalLines) {
      const lp = Math.max(0, Math.min(1, (vertFactor - vd.staggerOffset) / 0.55))
      if (lp <= 0) { vd.line.material.opacity = 0; continue }
      // line extends from zStart forward
      const curZ = THREE.MathUtils.lerp(vd.zStart, vd.zEnd, lp)
      const pArr = vd.line.geometry.attributes.position.array
      pArr[5] = curZ
      vd.line.geometry.attributes.position.needsUpdate = true
      vd.line.material.opacity = Math.min(0.55, lp * 0.55)
    }
    if (vertFactor >= 1.0) verticalDone = true
  }
  if (vertFactor < 1.0) verticalDone = false

  // Dust as text decorations — gentle floating
  const tSec = time * 0.001
  for (const p of dustParticles2) {
    const d = p.userData
    p.position.x = d.wx + Math.sin(tSec * d.floatFreq + d.ph) * d.floatAmp
    p.position.y = d.wy + Math.cos(tSec * d.floatFreq * 0.7 + d.ph) * d.floatAmp * 0.6
    p.position.z = d.wz + Math.sin(tSec * 0.2 + d.ph) * 0.5
    const cd = p.position.distanceTo(camera.position)
    const ds = 20 / Math.max(5, cd)
    p.scale.setScalar(d.scale * ds)
    // fade in as Act 2 progresses
    const vis = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (GRID_START - WHITE_OUT_THRESHOLD)))
    p.material.opacity = Math.max(0, vis * 0.22 * ds * 0.6)
  }
}

// ---- Act 2: exit ----
act2.exit = () => {
  ctx.set('gridVerticalLines', gridVerticalLines)
}

// ---- Act 2: dispose ----
act2.dispose = () => {}

// ============================================================
//  ACT 3  CONTENT PHASE  (sp 0.86 → 1.00, stub)
// ============================================================
const act3 = { name: 'ContentPhase', start: VERTICAL_START, end: 1.00 }

let dustParticles3 = []

act3.build = () => {
  const dc = ctx.get('dustConfig') || { count:135, color:'#f0f8ff', baseOpacity:0.14, baseRadius:0.015 }
  const geo = new THREE.SphereGeometry(dc.baseRadius, 10, 8)
  for (let i = 0; i < dc.count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color:dc.color, transparent:true, opacity:0, depthWrite:false })
    const p = new THREE.Mesh(geo, mat)
    // distribute in a wider, flatter volume for Act 3
    const t = Math.random()
    const zDist = -30 + t * 55  // spread from -30 to 25 in z
    const maxR = 12 + t * 8
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR
    p.position.set(Math.cos(angle)*r, -3 + Math.random()*6, zDist)
    p.userData = {
      wx:p.position.x, wy:p.position.y, wz:p.position.z,
      ph:Math.random()*Math.PI*2, scale:0.3+Math.random()*0.6,
      orbitSpeed:0.1+Math.random()*0.3, orbitR:0.5+Math.random()*2.0
    }
    scene.add(p)
    dustParticles3.push(p)
  }
}

act3.animate = (time, tSp, sp) => {
  const t = time * 0.001
  for (const p of dustParticles3) {
    const d = p.userData
    // gentle orbital float + subtle vertical drift
    p.position.x = d.wx + Math.cos(t*d.orbitSpeed+d.ph)*d.orbitR
    p.position.y = d.wy + Math.sin(t*0.4+d.ph)*0.8
    p.position.z = d.wz + Math.sin(t*0.3+d.ph)*0.5
    const cd = p.position.distanceTo(camera.position)
    const ds = 22 / Math.max(5, cd)
    p.scale.setScalar(d.scale * ds)
    // fade in as Act 3 becomes active
    const vis = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))
    p.material.opacity = Math.max(0, (0.0 + vis * 0.22) * Math.min(1, ds*0.5))
  }
}

act3.exit = () => {}
act3.dispose = () => {}

// ============================================================
//  ACT MANAGER
// ============================================================
const acts = [act1, act2, act3]
const builtActs = new Set()

function resolveActiveActs(sp) {
  const active = []
  for (const act of acts) {
    if (sp >= act.start - 0.01 && sp <= act.end + 0.01) {
      // lazy build
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

  // cross-act background transition — always applied
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

  // Act 1 is always built on mount (it starts at sp=0)
  if (act1.build) act1.build()
  builtActs.add(act1.name)

  // Handle inter-act state passing via exit detection
  let prevActiveNames = []
  const origAnimate = animate
  animate = function(time) {
    const sp = props.scrollProgress
    const activeNames = []
    for (const act of acts) {
      if (sp >= act.start - 0.01 && sp <= act.end + 0.01) activeNames.push(act.name)
    }
    // detect acts that fully exited this frame
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
