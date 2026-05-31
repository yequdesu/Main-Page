<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const emit = defineEmits([])

const canvasRef = ref(null)

let renderer, scene, camera
let lighthouseGroup, beamPivot
let beamCones = []
let beamRays = []
let oceanLines = []
let dustParticles = []
let animationId

const waveData = []
const waveBaseColors = [] // 存储海浪原始颜色，用于动态光照混合
let baseBeamAngle = 0
let scrollBeamOffset = 0
let scrollStartAngle = 0        // 滚动起始时的光束角度
let wasScrolling = false        // 上一帧是否在滚动
let returnToIdleTime = 0        // 返回空闲状态的时间点
let idlePhase = 0  // 自动旋转相位（返回空闲时计算）

// ═══════════════════════════════════════════
//  SKY & FOG (近实远虚：雾气使远处的浪线自然模糊)
// ═══════════════════════════════════════════
function buildSky() {
  scene.background = new THREE.Color('#050811')
  scene.fog = new THREE.FogExp2('#050811', 0.02)
}

// ═══════════════════════════════════════════
//  OCEAN (海浪覆盖 $-52$ 到 $+5$，灯塔位于 $-32$)
// ═══════════════════════════════════════════
function buildOcean() {
  const TOTAL = 50
  const POWER = 2.2

  for (let i = 0; i < TOTAL; i++) {
    const t = i / (TOTAL - 1)
    const curveT = Math.pow(t, POWER)
    
    // 浪线从极为遥远的深空 (-52) 延伸到相机下方 (5)
    const z = -52 + curveT * 57
    const baseY = -3.5 + curveT * 2.0
    
    // 空间透视：远处的波浪振幅极小，近处的波浪高耸且清晰
    const amplitude = 0.005 + curveT * 0.45
    const frequency = 0.12 + curveT * 0.22
    const speed = 0.35 * curveT + 0.05
    const phase = Math.random() * Math.PI * 2
    
    // 远处的线条在视觉上极其淡雅模糊，近处的线条扎实明亮
    const opacity = 0.10 + curveT * 0.67
    const span = 45 + curveT * 35

    // 海浪基色深浅渐变
    const rVal = Math.floor(3 + curveT * 15)
    const gVal = Math.floor(6 + curveT * 24)
    const bVal = Math.floor(12 + curveT * 38)
    const hex = `#${rVal.toString(16).padStart(2,'0')}${gVal.toString(16).padStart(2,'0')}${bVal.toString(16).padStart(2,'0')}`
    const baseColor = new THREE.Color(hex)
    waveBaseColors.push({ r: baseColor.r, g: baseColor.g, b: baseColor.b })

    const points = []
    const segmentCount = 150
    for (let j = 0; j <= segmentCount; j++) {
      const x = (j / segmentCount - 0.5) * span * 2
      points.push(new THREE.Vector3(x, baseY, z))
    }

    const geom = new THREE.BufferGeometry().setFromPoints(points)
    
    const colors = new Float32Array((segmentCount + 1) * 3)
    for (let j = 0; j <= segmentCount; j++) {
      colors[j * 3] = baseColor.r
      colors[j * 3 + 1] = baseColor.g
      colors[j * 3 + 2] = baseColor.b
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // 允许深度测试（但关闭深度写入以防止网格叠影），以便被灯塔遮挡
    const mat = new THREE.LineBasicMaterial({ 
      vertexColors: true, 
      transparent: true, 
      opacity, 
      depthWrite: false,
      depthTest: true
    })
    
    const line = new THREE.Line(geom, mat)
    scene.add(line)
    oceanLines.push(line)
    waveData.push({ baseY, z, amplitude, frequency, speed, phase, span, segmentCount, opacity })
  }
}

// ═══════════════════════════════════════════
//  LIGHTHOUSE (精细化打磨模型，添加多层级水下模糊)
// ═══════════════════════════════════════════
function buildLighthouse() {
  lighthouseGroup = new THREE.Group()

  const metalMat = new THREE.MeshStandardMaterial({ color: '#1b1f26', roughness: 0.4, metalness: 0.8 })
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#40454f', roughness: 0.9 })
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: '#252930', roughness: 0.8 })

  // 1. 水下基础混凝土柱体 (Foundation)
  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 1.4, 16),
    darkStoneMat
  )
  foundation.position.y = -0.9
  lighthouseGroup.add(foundation)

  // 【创意核心】水下消隐折射迷雾罩 (Shroud)
  // 其颜色与海面背景色一模一样，通过半透明度完美将没入海浪以下的柱体“模糊”消隐
  const shroudGeo = new THREE.CylinderGeometry(0.75, 1.3, 1.6, 16)
  const shroudMat = new THREE.MeshBasicMaterial({
    color: '#050811',
    transparent: true,
    opacity: 0.88,
    depthWrite: false
  })
  const shroud = new THREE.Mesh(shroudGeo, shroudMat)
  shroud.position.y = -0.95
  lighthouseGroup.add(shroud)

  // 2. 水面之上的粗糙花岗岩底座 (Base Rock)
  const rock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.4, 16),
    stoneMat
  )
  rock.position.y = -0.1
  lighthouseGroup.add(rock)

  // 基座上边缘过渡环
  const transitionRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, 0.12, 16),
    darkStoneMat
  )
  transitionRing.position.y = 0.12
  lighthouseGroup.add(transitionRing)

  // 3. 锥形渐窄主塔身 (Tapered Tower Shaft)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.30, 2.6, 20),
    new THREE.MeshStandardMaterial({ color: '#4d535c', roughness: 0.5, metalness: 0.1 })
  )
  body.position.y = 1.3
  lighthouseGroup.add(body)

  // 塔身装饰腰线双环
  const bandMat = new THREE.MeshStandardMaterial({ color: '#7a828f', roughness: 0.6 })
  const bands = [
    { y: 0.6, r: 0.27 },
    { y: 1.8, r: 0.22 }
  ]
  bands.forEach(b => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(b.r, 0.022, 8, 20),
      bandMat
    )
    band.rotation.x = Math.PI / 2
    band.position.y = b.y
    lighthouseGroup.add(band)
  })

  // 创意细节：塔身复古微光小窗户
  const windowGlowMat = new THREE.MeshBasicMaterial({ color: '#ffdf6d' })
  const windowFrameMat = new THREE.MeshBasicMaterial({ color: '#111317' })
  
  const windowConfigs = [
    { y: 1.0, rotY: 0.5, zOff: 0.24 },
    { y: 1.9, rotY: -0.8, zOff: 0.19 }
  ]
  windowConfigs.forEach(wc => {
    const winGroup = new THREE.Group()
    
    // 窗框
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), windowFrameMat)
    winGroup.add(frame)
    // 温暖发光玻璃
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.055), windowGlowMat)
    winGroup.add(glass)
    
    winGroup.position.set(0, wc.y, wc.zOff)
    winGroup.rotation.y = wc.rotY
    lighthouseGroup.add(winGroup)
  })

  // 4. 加宽观景露台 (Balcony Platform)
  const balcony = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.22, 0.12, 16),
    darkStoneMat
  )
  balcony.position.y = 2.6
  lighthouseGroup.add(balcony)

  // 阳台薄甲板
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.03, 16),
    metalMat
  )
  deck.position.y = 2.67
  lighthouseGroup.add(deck)

  // 创意细节：露台微型金属防护栏杆（环形扶手 + 8 根立柱）
  const railGroup = new THREE.Group()
  railGroup.position.y = 2.68
  // 顶部扶手圆环
  const handrail = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.008, 6, 24),
    metalMat
  )
  handrail.rotation.x = Math.PI / 2
  handrail.position.y = 0.15
  railGroup.add(handrail)
  
  // 8根环形排布的细立柱
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6),
      metalMat
    )
    post.position.set(Math.cos(angle) * 0.33, 0.075, Math.sin(angle) * 0.33)
    railGroup.add(post)
  }
  lighthouseGroup.add(railGroup)

  // 5. 灯室结构与框架支柱 (Lantern Room & Struts)
  const lanternFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.06, 16),
    metalMat
  )
  lanternFloor.position.y = 2.74
  lighthouseGroup.add(lanternFloor)

  // 玻璃透光罩
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.44, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 0.1, metalness: 0.9,
      emissive: '#ffffff', emissiveIntensity: 1.0, side: THREE.DoubleSide,
      transparent: true, opacity: 0.2
    })
  )
  lanternGlass.position.y = 2.96
  lighthouseGroup.add(lanternGlass)

  // 内部实体发光焦点
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), windowGlowMat)
  bulb.position.y = 2.96
  lighthouseGroup.add(bulb)

  // 创意细节：外围 6 根坚固的金属承重垂直立柱
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6),
      metalMat
    )
    strut.position.set(Math.cos(angle) * 0.22, 2.96, Math.sin(angle) * 0.22)
    lighthouseGroup.add(strut)
  }

  // 6. 顶盖多级穹顶及高耸避雷尖塔 (Roof Dome, Spire & Finial)
  const roofBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16),
    metalMat
  )
  roofBase.position.y = 3.18
  lighthouseGroup.add(roofBase)

  // 维多利亚式炭黑铜制穹顶 (Dome)
  const roofDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    metalMat
  )
  roofDome.position.y = 3.20
  lighthouseGroup.add(roofDome)

  // 穹顶顶部的风道排气帽 (Ventilation Cap)
  const ventCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12),
    metalMat
  )
  ventCap.position.y = 3.42
  lighthouseGroup.add(ventCap)

  // 黄金装饰球 (Ball Finial)
  const brassMat = new THREE.MeshStandardMaterial({ color: '#e5c158', roughness: 0.2, metalness: 0.9 })
  const decorBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 12),
    brassMat
  )
  decorBall.position.y = 3.47
  lighthouseGroup.add(decorBall)

  // 针状精细避雷针 (Lightning Rod Spire)
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.012, 0.35, 8),
    metalMat
  )
  spire.position.y = 3.65
  lighthouseGroup.add(spire)

  // 整体定位在 Y = -2.5 (上提以凸显塔身立体感)
  lighthouseGroup.position.set(0, -2.65, -32)
  lighthouseGroup.scale.setScalar(0.7)
  scene.add(lighthouseGroup)
}

// ═══════════════════════════════════════════
//  LIGHT BEAM (体积光主方向指向 +Z)
// ═══════════════════════════════════════════
const VolumetricBeamShader = {
  uniforms: {
    uColor: { value: new THREE.Color('#ffffff') },
    uOpacity: { value: 0.4 },
    uLength: { value: 30.0 },
    uEdgePower: { value: 2.0 }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      vPosition = position;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uLength;
    uniform float uEdgePower;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);

      float edgeIntensity = pow(abs(dot(normal, viewDir)), uEdgePower);
      edgeIntensity = 0.25 + edgeIntensity * 0.75;

      float lengthFade = pow(clamp(1.0 - (abs(vPosition.y) / uLength), 0.0, 1.0), 1.5);

      float alpha = edgeIntensity * lengthFade * uOpacity;
      gl_FragColor = vec4(uColor, alpha);
    }
  `
}

function buildLightBeam() {
  beamPivot = new THREE.Group()
  beamPivot.position.copy(lighthouseGroup.position)
  // 将旋转中心高度精准对齐到重构后的发光晶核中心 (2.96)
  beamPivot.position.y += 2.96 * lighthouseGroup.scale.y
  scene.add(beamPivot)

  const beamConfigs = [
    { radius: 0.5,  length: 28, opacity: 0.85, power: 4.0 }, // 强散射核心
    { radius: 1.8,  length: 32, opacity: 0.45, power: 2.5 }, // 实体锥体
    { radius: 4.8,  length: 36, opacity: 0.15, power: 1.5 }  // 环境溢光
  ]

  beamConfigs.forEach(cfg => {
    const geo = new THREE.ConeGeometry(cfg.radius, cfg.length, 32, 1, true)
    geo.translate(0, -cfg.length / 2, 0)
    
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#f0f7ff') },
        uOpacity: { value: cfg.opacity },
        uLength: { value: cfg.length },
        uEdgePower: { value: cfg.power }
      },
      vertexShader: VolumetricBeamShader.vertexShader,
      fragmentShader: VolumetricBeamShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })

    const cone = new THREE.Mesh(geo, mat)
    cone.rotation.x = -Math.PI / 2
    beamPivot.add(cone)
    beamCones.push(cone)
  })

  const rayLen = 55
  const raySpread = 4.5

  function makeRay(dx) {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx * raySpread, 0, rayLen)]
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
      1, 1, 1,
      0.3, 0.3, 0.3
    ]), 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    return new THREE.Line(geom, mat)
  }

  beamPivot.add(makeRay(-1))
  beamPivot.add(makeRay(1))
  beamRays.push(beamPivot.children[beamPivot.children.length - 2])
  beamRays.push(beamPivot.children[beamPivot.children.length - 1])

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 })
  )
  beamPivot.add(glow)
}

// ═══════════════════════════════════════════
//  DUST (高精圆形球面粉尘系统)
// ═══════════════════════════════════════════
function buildDustParticles() {
  // 将网格段数提升到 (12, 12)，彻底解决贴近镜头放大时的棱角多边形问题，变为丝滑圆球
  const geo = new THREE.SphereGeometry(0.015, 12, 12)
  const count = 135
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#f0f8ff',
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
    const p = new THREE.Mesh(geo, mat)

    const t = Math.random()
    const worldOrigin = new THREE.Vector3()
    lighthouseGroup.getWorldPosition(worldOrigin)
    worldOrigin.y += 2.96 * lighthouseGroup.scale.y

    const zDist = 1 + t * 41 
    const maxR = (zDist / 42) * 7.5 + 0.2
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR

    p.position.set(
      worldOrigin.x + Math.cos(angle) * r,
      worldOrigin.y + (Math.random() - 0.5) * maxR * 0.6,
      worldOrigin.z + zDist
    )
    p.userData = {
      wx: p.position.x, wy: p.position.y, wz: p.position.z,
      dx: (Math.random() - 0.5) * 0.15,
      dy: (Math.random() - 0.5) * 0.1 + 0.06,
      dz: (Math.random() - 0.5) * 0.08,
      ph: Math.random() * Math.PI * 2,
      scale: 0.4 + Math.random() * 0.8
    }
    scene.add(p)
    dustParticles.push(p)
  }
}

// ═══════════════════════════════════════════
//  LIGHTING (辅助光源)
// ═══════════════════════════════════════════
function buildLights() {
  scene.add(new THREE.AmbientLight('#222d3d', 1.4))
  
  const dir = new THREE.DirectionalLight('#aed2ff', 1.8)
  dir.position.set(15, 10, -10)
  scene.add(dir)

  const skyLight = new THREE.DirectionalLight('#ffffff', 0.5)
  skyLight.position.set(-15, 12, -35)
  scene.add(skyLight)

  const pt = new THREE.PointLight('#ffffff', 3.0, 15, 1.0)
  pt.position.copy(lighthouseGroup.position)
  pt.position.y += 2.96 * lighthouseGroup.scale.y
  scene.add(pt)
}

function buildCamera(w, h) {
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 150)
  camera.position.set(0, 0.25, 8)
  camera.lookAt(0, -0.65, -24)
}

// ═══════════════════════════════════════════
//  ANIMATION & SPECULAR LOGIC (反射精细化整合)
// ═══════════════════════════════════════════
function animateWavesAndLighting(time) {
  const sp = props.scrollProgress
  const highlightFade = sp >= WHITE_OUT_THRESHOLD
    ? Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
    : 0
  const colorShift = sp > WHITE_OUT_END
    ? Math.max(0, Math.min(1, (sp - WHITE_OUT_END) / (TEXT_START - WHITE_OUT_END)))
    : 0
  const isTransition = highlightFade > 0 || colorShift > 0

  const beamOrigin = new THREE.Vector3()
  beamPivot.getWorldPosition(beamOrigin)
  const beamDir = new THREE.Vector3(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()

  for (let i = 0; i < oceanLines.length; i++) {
    const line = oceanLines[i]
    const data = waveData[i]
    const baseCol = waveBaseColors[i]
    const posAttr = line.geometry.attributes.position
    const colAttr = line.geometry.attributes.color
    const posArr = posAttr.array
    const colArr = colAttr.array

    for (let j = 0; j <= data.segmentCount; j++) {
      const idx = j * 3
      const x = posArr[idx]
      const t = time * data.speed + data.phase
      
      const y = data.baseY +
        Math.sin(x * data.frequency + t) * data.amplitude +
        Math.sin(x * data.frequency * 1.8 + t * 1.2) * data.amplitude * 0.4
      posArr[idx + 1] = y

      const vx = x - beamOrigin.x
      const vy = y - beamOrigin.y
      const vz = data.z - beamOrigin.z
      const proj = vx * beamDir.x + vy * beamDir.y + vz * beamDir.z
      const localX = vx * beamDir.z - vz * beamDir.x
      const beamRadius = 1.2 + Math.max(0.0, proj) * 0.15
      const distSq = (localX * localX) / (beamRadius * beamRadius) + (vy * vy) / 1.5
      let directIntensity = Math.exp(-distSq * 0.9)
      const smoothProj = Math.max(0.0, Math.min(1.0, (proj + 4.0) / 8.0))
      directIntensity *= smoothProj
      const fDist = Math.max(0.0, 1.0 - (Math.max(0.0, proj) / 48.0))
      directIntensity *= fDist
      let lightIntensity = directIntensity * 1.5
      if (beamDir.z > 0 && vz > 0) {
        const specStretch = Math.exp(-(x * x) / 7.0) * beamDir.z * 1.3
        lightIntensity += directIntensity * specStretch
      }

      const hR = 0.92, hG = 0.97, hB = 1.0
      const hlR = baseCol.r + (hR - baseCol.r) * lightIntensity * 0.95
      const hlG = baseCol.g + (hG - baseCol.g) * lightIntensity * 0.95
      const hlB = baseCol.b + (hB - baseCol.b) * lightIntensity * 0.95

      if (isTransition) {
        let r = hlR + (baseCol.r - hlR) * highlightFade
        let g = hlG + (baseCol.g - hlG) * highlightFade
        let b = hlB + (baseCol.b - hlB) * highlightFade
        const grayR = 0.35, grayG = 0.35, grayB = 0.35
        colArr[idx] = r + (grayR - r) * colorShift
        colArr[idx + 1] = g + (grayG - g) * colorShift
        colArr[idx + 2] = b + (grayB - b) * colorShift
      } else {
        colArr[idx] = hlR
        colArr[idx + 1] = hlG
        colArr[idx + 2] = hlB
      }
    }

    if (isTransition) {
      const boostFactor = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / 0.15))
      line.material.opacity = data.opacity + (0.50 - data.opacity) * boostFactor
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  }
}

function animateDust(time, scrollProgress) {
  if (!beamPivot || !camera) return
  const t = time * 0.001

  const beamWorldOrigin = new THREE.Vector3()
  beamPivot.getWorldPosition(beamWorldOrigin)
  const beamDir = new THREE.Vector3(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()

  for (const p of dustParticles) {
    const d = p.userData
    p.position.x = d.wx + Math.sin(t * 0.4 + d.ph) * 0.25
    p.position.y = d.wy + Math.sin(t * 0.3 + d.ph + 1) * 0.18
    p.position.z = d.wz + Math.sin(t * 0.25 + d.ph + 2) * 0.15

    const toParticle = new THREE.Vector3().subVectors(p.position, beamWorldOrigin)
    const proj = toParticle.dot(beamDir)

    let beamFactor = 0
    if (proj > 0 && proj < 45) {
      const projPoint = beamWorldOrigin.clone().addScaledVector(beamDir, proj)
      const dist = p.position.distanceTo(projPoint)
      const beamRadius = (proj / 45) * 5.5 + 0.2
      if (dist < beamRadius) {
        beamFactor = Math.pow(1.0 - dist / beamRadius, 1.8)
      }
    }

    const cameraDist = p.position.distanceTo(camera.position)
    const distanceScale = 22.0 / Math.max(5.0, cameraDist)

    const s = d.scale * (0.4 + beamFactor * 2.0) * distanceScale
    p.scale.setScalar(s)

    const baseOpacity = 0.14
    let finalOpacity = (baseOpacity + beamFactor * 0.76) * (0.35 + scrollProgress * 0.65)

    if (cameraDist < 7.0) {
      finalOpacity *= Math.max(0.0, (cameraDist - 2.5) / 4.5)
    }
    if (cameraDist > 42.0) {
      finalOpacity *= Math.max(0.0, 1.0 - (cameraDist - 42.0) / 10.0)
    }

    p.material.opacity = Math.max(0.0, finalOpacity)
  }
}

// ═══════════════════════════════════════════
//  ORBIT PHASE (星环轨道 + 地面平面下沉 + 导航星球)
// ═══════════════════════════════════════════
let orbitInitialized = false
let orbitParticles = []
let groundVerticalLines = []

const RING_CENTER = new THREE.Vector3(0, 0, -3)
const RING_TILT = Math.PI / 2.8
const NAV_SITES = [
  { label: 'FS', url: 'https://fs.yequdesu.top', color: '#5b8c5a' },
  { label: 'Code', url: 'https://code.yequdesu.top', color: '#5a88b2' },
  { label: 'GitHub', url: 'https://github.com/YeQuDesu', color: '#8b6b4d' }
]

function initOrbitPhase() {
  if (orbitInitialized) return

  const navIndices = [
    Math.floor(Math.random() * dustParticles.length),
    Math.floor(Math.random() * dustParticles.length),
    Math.floor(Math.random() * dustParticles.length)
  ]
  // ensure unique
  while (navIndices[1] === navIndices[0]) navIndices[1] = Math.floor(Math.random() * dustParticles.length)
  while (navIndices[2] === navIndices[0] || navIndices[2] === navIndices[1]) navIndices[2] = Math.floor(Math.random() * dustParticles.length)

  for (let i = 0; i < dustParticles.length; i++) {
    const p = dustParticles[i]
    const navIdx = navIndices.indexOf(i)
    const isNav = navIdx >= 0

    p.userData.orbitAngle = Math.random() * Math.PI * 2
    p.userData.orbitRadius = isNav ? 3.5 + navIdx * 0.8 : 2.5 + Math.random() * 3.0
    p.userData.orbitSpeed = isNav ? 0.15 + navIdx * 0.1 : 0.2 + Math.random() * 0.5
    p.userData.orbitTiltY = 0.7 + Math.random() * 0.6
    p.userData.orbitBaseScale = isNav ? 2.2 : 0.5 + Math.random() * 0.5
    p.userData.orbitGray = isNav ? 0 : 0.2 + Math.random() * 0.45
    p.userData.orbitIsNav = isNav
    if (isNav) {
      p.userData.orbitNavUrl = NAV_SITES[navIdx].url
      p.userData.orbitNavColor = NAV_SITES[navIdx].color
    }
  }

  // Create ground plane vertical perspective lines
  const vpY = -1.5 // vanishing point Y
  const fpY = -4.5 // floor plane bottom Y
  const vCount = 16
  const xSpan = 14
  for (let i = 0; i < vCount; i++) {
    const x = -xSpan / 2 + (i / (vCount - 1)) * xSpan
    const pts = [
      new THREE.Vector3(x * 0.2, vpY, 0),
      new THREE.Vector3(x, fpY, 5)
    ]
    const geom = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: '#555555', transparent: true, opacity: 0, depthTest: false, depthWrite: false
    })
    const line = new THREE.Line(geom, mat)
    scene.add(line)
    groundVerticalLines.push({ line, x, fpY, vpY })
  }

  orbitInitialized = true
}

function animateOrbitPhase(time, orbitProgress) {
  initOrbitPhase()

  // ── Ground plane: flatten ocean lines + slide down ──
  const flatFactor = Math.min(1, orbitProgress * 3) // flatten quickly (first 33%)
  const slideDown = orbitProgress * 7

  for (let i = 0; i < oceanLines.length; i++) {
    const line = oceanLines[i]
    const data = waveData[i]
    const posAttr = line.geometry.attributes.position
    const colArr = line.geometry.attributes.color.array
    const posArr = posAttr.array

    const frac = i / Math.max(1, oceanLines.length - 1)
    const flatY = -2.5 + frac * 3.0 - slideDown

    for (let j = 0; j <= data.segmentCount; j++) {
      const idx = j * 3
      const t = time * data.speed + data.phase
      const waveY = data.baseY +
        Math.sin(posArr[idx] * data.frequency + t) * data.amplitude +
        Math.sin(posArr[idx] * data.frequency * 1.8 + t * 1.2) * data.amplitude * 0.4

      posArr[idx + 1] = waveY + (flatY - waveY) * flatFactor
    }
    posAttr.needsUpdate = true

    line.material.opacity = 0.45 + (0.25 - 0.45) * flatFactor
  }

  // Ground vertical lines: slide down
  for (const vLine of groundVerticalLines) {
    const shift = slideDown * 1.2
    const posArr = vLine.line.geometry.attributes.position.array
    posArr[1] -= shift * 0.05 // vanish point shifts slightly
    posArr[4] = vLine.fpY - shift
    vLine.line.geometry.attributes.position.needsUpdate = true
    vLine.line.material.opacity = 0.35 * (1 - Math.min(1, orbitProgress * 2))
  }

  // ── Dust → orbiting ring ──
  const cosT = Math.cos(RING_TILT), sinT = Math.sin(RING_TILT)
  const gatherPhase = Math.min(1, orbitProgress * 2.5)

  for (const p of dustParticles) {
    const d = p.userData
    const angle = d.orbitAngle + time * d.orbitSpeed

    // Ring position (3D tilted circle)
    const lx = Math.cos(angle) * d.orbitRadius
    const ly = Math.sin(angle) * d.orbitRadius * d.orbitTiltY
    const wx = lx
    const wy = ly * cosT
    const wz = ly * sinT

    // Gather from current dust position to ring target
    const targetX = RING_CENTER.x + wx
    const targetY = RING_CENTER.y + wy
    const targetZ = RING_CENTER.z + wz

    p.position.x += (targetX - p.position.x) * 0.08
    p.position.y += (targetY - p.position.y) * 0.08
    p.position.z += (targetZ - p.position.z) * 0.08

    // Scale transition
    const s = d.orbitBaseScale * gatherPhase
    p.scale.setScalar(s)

    // Color: varied grays
    if (d.orbitIsNav) {
      p.material.color.set(d.orbitNavColor)
      p.material.opacity = gatherPhase * 0.9
    } else {
      const g = d.orbitGray
      p.material.color.setRGB(g * 1.1, g, g * 0.85)
      p.material.opacity = gatherPhase * 0.65 * (wz > 0 ? 0.35 : 1.0)
    }
  }

  // Fade out beam and lighthouse during orbit
  if (orbitProgress > 0.3) {
    const fadeOut = (orbitProgress - 0.3) / 0.3
    if (beamPivot) beamPivot.children.forEach(c => {
      if (c.material && c.material.opacity !== undefined) c.material.opacity *= (1 - fadeOut * 0.1)
    })
    if (lighthouseGroup) {
      lighthouseGroup.children.forEach(c => {
        if (c.material && c.material.opacity !== undefined) c.material.opacity = Math.max(0, (c.material.opacity || 1) - fadeOut * 0.08)
      })
    }
  }
}

function handleCanvasClick(event) {
  if (!orbitInitialized || !camera || !renderer) return

  const rect = renderer.domElement.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)
  raycaster.params.Points.threshold = 0.3
  raycaster.params.Mesh.threshold = 0.3

  const navParticles = dustParticles.filter(p => p.userData.orbitIsNav)
  const intersects = raycaster.intersectObjects(navParticles)

  if (intersects.length > 0) {
    const url = intersects[0].object.userData.orbitNavUrl
    if (url) window.open(url, '_blank')
  }
}

// ═══════════════════════════════════════════
//  CONTROL & TRANSITION (白场过载与探照轨迹)
// ═══════════════════════════════════════════
const PHASE1_END = 4 / 6
const WHITE_OUT_THRESHOLD = 0.65 * PHASE1_END
const WHITE_OUT_END = 0.78 * PHASE1_END
const TEXT_START = 0.94 * PHASE1_END
const IDLE_RESET_DELAY = 1.5

function shortestDelta(from, to) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// 白场过载动画：持续下拉，浓度、背景色和全局光晕暴增
function updateWhiteOut(scrollProgress) {
  if (!scene) return
  
  const whiteOutFactor = Math.max(0.0, Math.min(1.0, (scrollProgress - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))

  const baseBg = new THREE.Color('#050811')
  const targetBg = new THREE.Color('#ffffff')
  const currentBg = baseBg.clone().lerp(targetBg, whiteOutFactor)
  scene.background = currentBg
  
  if (scene.fog) {
    scene.fog.color = currentBg
    scene.fog.density = 0.02 + whiteOutFactor * 0.18
  }

  const ambientLight = scene.children.find(c => c.isAmbientLight)
  if (ambientLight) {
    ambientLight.intensity = 1.4 + whiteOutFactor * 8.0
  }
}

function animateBeam(time, scrollProgress) {
  if (!beamPivot) return

  let targetY = 0
  let targetX = 0.08
  let beamOpacityMult = 1.0

  const isScrolling = scrollProgress > 0.005

  if (!isScrolling) {
    if (wasScrolling) {
      wasScrolling = false
      returnToIdleTime = time
      baseBeamAngle = beamPivot.rotation.y
      idlePhase = baseBeamAngle - (time * 0.20 + Math.sin(time * 0.12) * 2.2)
    }

    const elapsed = time - returnToIdleTime

    // 随机探索
    const slowDrive = time * 0.20                
    const sweep1 = Math.sin(time * 0.12) * 2.2   
    const sweep2 = Math.cos(time * 0.41) * 0.5   
    const wanderY = slowDrive + sweep1 + sweep2

    const pitchOsc = Math.sin(time * 0.3) * 0.03 + Math.cos(time * 0.67) * 0.015
    const wanderX = 0.06 + pitchOsc

    if (elapsed < IDLE_RESET_DELAY) {
      const blend = Math.min(1, elapsed / IDLE_RESET_DELAY)
      const eased = blend * blend * (3 - 2 * blend)
      targetY = baseBeamAngle + shortestDelta(baseBeamAngle, wanderY + idlePhase) * eased
      targetX = THREE.MathUtils.lerp(beamPivot.rotation.x, wanderX, eased)
    } else {
      targetY = wanderY + idlePhase
      targetX = wanderX
    }

  } else if (scrollProgress >= WHITE_OUT_THRESHOLD) {
    wasScrolling = true
    targetY = 0       
    targetX = -0.02   
    beamOpacityMult = 1.0

  } else {
    if (!wasScrolling) {
      scrollStartAngle = beamPivot.rotation.y
      wasScrolling = true
    }

    const blend = scrollProgress / WHITE_OUT_THRESHOLD
    const eased = blend * blend * (3 - 2 * blend)

    const delta = shortestDelta(scrollStartAngle, 0)
    targetY = scrollStartAngle + delta * eased
    targetX = THREE.MathUtils.lerp(0.06, -0.02, eased)
    beamOpacityMult = 1.0
  }

  beamPivot.rotation.y = targetY
  beamPivot.rotation.x = targetX

  // 亮度与光亮持续累积
  const beamBoost = Math.pow(scrollProgress, 1.5) * 0.4
  const whiteOutFactor = Math.max(0.0, Math.min(1.0, (scrollProgress - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  
  for (let i = 0; i < beamCones.length; i++) {
    const baseVals = [0.85, 0.45, 0.15]
    const multiplier = i === 2 ? 1.8 : 1.2
    beamCones[i].material.uniforms.uOpacity.value = (baseVals[i] + beamBoost * multiplier + whiteOutFactor * 1.5) * beamOpacityMult
  }

  for (const ray of beamRays) {
    ray.material.opacity = (0.45 + scrollProgress * 0.35 + whiteOutFactor * 0.5) * beamOpacityMult
  }

  const pt = scene.children.find(c => c.isPointLight)
  if (pt) {
    pt.intensity = (3.0 + Math.pow(scrollProgress, 1.5) * 12.0 + whiteOutFactor * 50.0) * beamOpacityMult
  }
}

function animate(time) {
  animationId = requestAnimationFrame(animate)
  const t = time * 0.001

  if (props.scrollProgress >= PHASE1_END) {
    const orbitProgress = (props.scrollProgress - PHASE1_END) / (1 - PHASE1_END)
    animateOrbitPhase(t, orbitProgress)
  } else {
    animateBeam(t, props.scrollProgress)
    animateWavesAndLighting(t)
    animateDust(time, props.scrollProgress)
    updateWhiteOut(props.scrollProgress)
  }

  renderer.render(scene, camera)
}

function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

onMounted(() => {
  const w = window.innerWidth
  const h = window.innerHeight
  scene = new THREE.Scene()
  buildSky()
  buildCamera(w, h)
  
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: false, antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  
  buildOcean()
  buildLighthouse()
  buildLightBeam()
  buildDustParticles()
  buildLights()
  
  animationId = requestAnimationFrame(animate)
  window.addEventListener('resize', onResize)
  canvasRef.value.addEventListener('click', handleCanvasClick)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.dispose()
  scene?.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose())
      } else {
        obj.material.dispose()
      }
    }
  })
})
</script>

<template>
  <canvas ref="canvasRef" style="position:fixed;inset:0;z-index:0" />
</template>