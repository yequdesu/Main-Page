import * as THREE from 'three'
import { WHITE_OUT_THRESHOLD, WHITE_OUT_END, IDLE_RESET_DELAY, SCENE_CENTER_Z } from '../constants.js'
import { smoothstep, shortestDelta } from '../constants.js'

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

function buildLighthouse(ctx) {
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
  ctx.scene.add(lighthouseGroup)
}

function buildBeam(ctx) {
  beamPivot = new THREE.Group()
  beamPivot.position.copy(lighthouseGroup.position)
  beamPivot.position.y += 2.96 * lighthouseGroup.scale.y
  ctx.scene.add(beamPivot)

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

function buildLights(ctx) {
  _ambientLightRef = new THREE.AmbientLight('#222d3d', 1.4)
  ctx.scene.add(_ambientLightRef)
  const dir = new THREE.DirectionalLight('#aed2ff', 1.8); dir.position.set(15,10,-10); ctx.scene.add(dir)
  const sky = new THREE.DirectionalLight('#ffffff', 0.5); sky.position.set(-15,12,-35); ctx.scene.add(sky)
  _ptLightRef = new THREE.PointLight('#ffffff', 3.0, 15, 1.0)
  _ptLightRef.position.copy(lighthouseGroup.position)
  _ptLightRef.position.y += 2.96 * lighthouseGroup.scale.y
  ctx.scene.add(_ptLightRef)
}

export function animateBeam(time, sp, ctx) {
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

export function disposeLightBeam(ctx) {
  ctx.scene.remove(lighthouseGroup)
  ctx.scene.remove(beamPivot)
  ctx.scene.remove(_ambientLightRef)
  ctx.scene.remove(_ptLightRef)
  // Detailed geometry disposal handled by scene traverse in onUnmounted
  lighthouseGroup = null
  beamPivot = null
  beamCones = []
  beamRays = []
  beamGlow = null
  _ambientLightRef = null
  _ptLightRef = null
}
