import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial, Vector2, Vector3,
  InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry, SphereGeometry, DataTexture, FloatType, RGBAFormat, NearestFilter,
} from 'three'
import { createStellarLimbFrame, type createStellarActivityChannels } from '../../behaviors/stellarActivity'
import { createFluxRopeSimulation, PLASMA, PLASMA_COUNT } from '../../behaviors/stellarPlasma'
import { MAGNETIC, magneticEase, magneticStage } from '../../behaviors/stellarMagnetism'
import { STRUCTURE_LAYOUT, type getStructureLayout } from '../../behaviors/structureLayout'

export const STELLAR_ACTIVITY_STYLE = {
  filamentColor: '#edab68',
  particleColor: '#ffd34d',
  particleHighlight: '#fff0a3',
  particleCount: PLASMA_COUNT,
} as const

const commonShader = `
  uniform vec3 uAnchor, uTangent, uNormal;
  uniform float uScale, uRadius, uAge, uSeed, uOpacity, uRopeRadius, uReconnection, uCondensation, uCme;
  vec3 basis(vec3 p) { return uTangent * p.x + uNormal * p.y + cross(uTangent, uNormal) * p.z; }
  vec3 worldPoint(vec3 p) {
    vec3 result = uAnchor + basis(p) * uScale;
    result -= uNormal * (p.x * p.x * uScale * uScale / (2.0 * uRadius) + uScale * 0.014);
    return result;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
`
const transparentPlasma = {
  transparent: true, blending: AdditiveBlending, side: DoubleSide, forceSinglePass: true, depthWrite: false, depthTest: true,
} as const

function createRibbonGeometry() {
  const segments = MAGNETIC.samples - 1, vertices: number[] = [], indices: number[] = []
  for (let strand = 0; strand < PLASMA.strands; strand++) {
    const offset = vertices.length / 3
    for (let i = 0; i <= segments; i++) for (const side of [-1, 1]) vertices.push(i / segments, side, strand)
    for (let i = 0; i < segments; i++) {
      const v = offset + i * 2
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setIndex(indices)
  return geometry
}
function createParcelGeometry() {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, 1,-1,0, 1,1,0, -1,1,0]), 3))
  for (const name of ['aCenter', 'aDirection', 'aState']) geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(PLASMA_COUNT * 3), 3))
  geometry.instanceCount = PLASMA_COUNT
  return geometry
}

/** 凹陷磁通绳 + 沿场等离子体团块 + CME 前缘/重联拱廊。每个 Act 4 实例独占 GPU 资源。 */
export function createStellarActivity(channels: ReturnType<typeof createStellarActivityChannels>) {
  const root = new Group()
  root.name = '日珥与日冕抛射'
  const limb = createStellarLimbFrame()
  const ribbonGeometry = createRibbonGeometry(), shellGeometry = new SphereGeometry(1, 40, 24), sheetGeometry = new PlaneGeometry(2, 2)
  const geometries: BufferGeometry[] = [ribbonGeometry, shellGeometry, sheetGeometry]
  const materials: ShaderMaterial[] = []
  const textures: DataTexture[] = []
  let viewWidth = 1, viewHeight = 1, sunRadius = 1, pixelWidth = 1280, pixelHeight = 720
  let localWorldHeight: number | null = null
  function add(geometry: BufferGeometry, material: ShaderMaterial, name: string, order = 2) {
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.renderOrder = order
    mesh.frustumCulled = false
    materials.push(material)
    root.add(mesh)
    return mesh
  }
  const patches = [...channels.prominences, channels.cme].map((channel, index) => {
    const cme = index === 2
    const model = createFluxRopeSimulation(channel.seed, cme, channel.morphology)
    const texture = new DataTexture(model.curveData, MAGNETIC.samples, MAGNETIC.strands * 3, RGBAFormat, FloatType)
    texture.minFilter = NearestFilter; texture.magFilter = NearestFilter
    texture.needsUpdate = true
    textures.push(texture)
    const uniforms = {
      uAnchor: { value: new Vector3() }, uTangent: { value: new Vector3() }, uNormal: { value: new Vector3() },
      uScale: { value: 1 }, uRadius: { value: 1 }, uAge: { value: 0 }, uSeed: { value: 0 }, uOpacity: { value: 0 },
      uRopeRadius: { value: 1 }, uReconnection: { value: 0 }, uCondensation: { value: 0 }, uCme: { value: cme ? 1 : 0 },
      uPixelSize: { value: new Vector2() }, uUnitPixels: { value: 1 }, uBranch: { value: 0 },
      uCurves: { value: texture }, uNeck: { value: new Vector3() }, uApex: { value: new Vector3() },
      uShape: { value: new Vector2(model.shape.span, model.shape.height) },
      uColor: { value: new Color(STELLAR_ACTIVITY_STYLE.filamentColor) },
      uGold: { value: new Color(STELLAR_ACTIVITY_STYLE.particleColor) },
      uHighlight: { value: new Color(STELLAR_ACTIVITY_STYLE.particleHighlight) },
    }
    const ribbonShaders = {
      vertexShader: `${commonShader}
        uniform sampler2D uCurves;
        uniform float uBranch;
        varying vec3 vRibbon;
        varying float vVisible, vPulse;
        vec4 curve(float t,float strand) {
          float cell=t*${(MAGNETIC.samples - 1).toFixed(1)}, lo=min(${(MAGNETIC.samples - 2).toFixed(1)},floor(cell));
          float row=(uBranch*12.0+strand+0.5)/36.0;
          vec4 a=texture2D(uCurves,vec2((lo+0.5)/${MAGNETIC.samples.toFixed(1)},row));
          vec4 b=texture2D(uCurves,vec2((lo+1.5)/${MAGNETIC.samples.toFixed(1)},row));
          return mix(a,b,cell-lo);
        }
        void main() {
          float t=position.x, strand=position.z;
          vec4 point=curve(t,strand);
          vec3 direction=curve(min(1.0,t+0.002),strand).xyz-curve(max(0.0,t-0.002),strand).xyz;
          // 视空间展宽，避免纵深扭转时带状线条侧向消失。
          vec4 mv=modelViewMatrix*vec4(worldPoint(point.xyz),1.0);
          vec3 viewDirection=mat3(modelViewMatrix)*basis(direction);
          vec2 across=normalize(vec2(-viewDirection.y,viewDirection.x)+vec2(0.000001));
          mv.xy+=across*position.y*point.w*uScale*(0.8+0.4*uCondensation);
          gl_Position=projectionMatrix*mv;
          float source=t;
          if(uBranch>1.5) source=t<0.5 ? 0.44*t : 1.0-0.44*(1.0-t);
          else if(uBranch>0.5) source=0.22+0.56*t;
          vRibbon=vec3(source,position.y,strand);
          float stage=clamp((uRopeRadius-(1.48+0.32*fract(strand*0.618+uSeed)))/1.38,0.0,1.0);
          float split=step(0.45,stage)*uCme;
          vVisible=uBranch<0.5 ? 1.0-split : split;
          vPulse=exp(-pow((stage-0.45)/0.10,2.0))*uCme;
        }`,
      fragmentShader: `${commonShader}
        uniform vec3 uColor, uHighlight;
        uniform float uBranch;
        varying vec3 vRibbon;
        varying float vVisible, vPulse;
        void main() {
          float t=vRibbon.x, strand=vRibbon.z;
          float direction=mod(strand,2.0)*2.0-1.0;
          float filaments=noise(vec2(t*27.0-direction*uAge*0.7,strand*3.7+uSeed*7.0));
          filaments*=noise(vec2(t*61.0-direction*uAge*0.45,strand+uSeed*9.0))*0.5+0.5;
          float dip=exp(-pow((t-0.5)/0.24,4.0));
          float dilution=uBranch>1.5 ? 1.0 : pow(uRopeRadius,0.65);
          float density=(0.09+filaments*(0.40+dip*uCondensation*0.7))/dilution;
          float edge=exp(-vRibbon.y*vRibbon.y*4.0)*(1.0-smoothstep(0.7,1.0,abs(vRibbon.y)));
          float feet=smoothstep(0.0,0.045,t)*(1.0-smoothstep(0.955,1.0,t));
          float neck=exp(-pow((abs(t-0.5)-0.28)/0.045,2.0))*vPulse;
          float alpha=(density+neck*0.35)*edge*feet*uOpacity*vVisible*0.75;
          gl_FragColor=vec4(mix(uColor,uHighlight,neck*0.5),alpha);
          #include <colorspace_fragment>
        }`,
    }
    add(ribbonGeometry, new ShaderMaterial({ uniforms, ...ribbonShaders, ...transparentPlasma }), cme ? '日冕抛射弧丝' : `日珥弧丝_${index}`)
    const parcels = createParcelGeometry()
    geometries.push(parcels)
    add(parcels, new ShaderMaterial({
      uniforms, ...transparentPlasma,
      vertexShader: `${commonShader}
        uniform vec2 uPixelSize;
        uniform float uUnitPixels;
        attribute vec3 aCenter, aDirection, aState;
        varying vec2 vParticle;
        varying vec3 vState;
        void main() {
          vec4 mv = modelViewMatrix * vec4(worldPoint(aCenter),1.0);
          vec3 dir = mat3(modelViewMatrix) * basis(aDirection);
          vec2 along = normalize(dir.xy + vec2(0.00001));
          vec2 across = vec2(-along.y,along.x);
          float cold = 1.0 - smoothstep(0.15,0.85,aState.x);
          float halfLength = max(1.2,uUnitPixels*(0.035+0.055*cold));
          float halfWidth = max(0.48,uUnitPixels*(0.018+0.012*cold));
          gl_Position = projectionMatrix * mv;
          gl_Position.xy += (along*position.x*halfLength + across*position.y*halfWidth)*uPixelSize*2.0*gl_Position.w;
          vParticle = position.xy; vState = aState;
        }`,
      fragmentShader: `${commonShader}
        uniform vec3 uColor, uGold, uHighlight;
        varying vec2 vParticle;
        varying vec3 vState;
        void main() {
          float glow = exp(-vParticle.y*vParticle.y*4.5)*pow(max(0.0,1.0-vParticle.x*vParticle.x),1.2);
          float cold = 1.0-smoothstep(0.15,0.85,vState.x);
          float emission = min(1.0,pow(vState.y,0.65))*(0.22+0.78*cold);
          emission = mix(emission,min(1.0,pow(vState.y,0.40))*(0.6+0.4*cold),uCme);
          vec3 tint = mix(uColor,mix(uGold,uHighlight,vState.z*0.22),uCme);
          gl_FragColor = vec4(tint,glow*emission*uOpacity*0.95);
          #include <colorspace_fragment>
        }`,
    }), cme ? '日冕抛射金色粒子' : `日珥等离子体_${index}`, 3)
    if (cme) {
      add(shellGeometry, new ShaderMaterial({
        uniforms, ...transparentPlasma,
        vertexShader: `${commonShader}
          uniform vec3 uApex;
          uniform vec2 uShape;
          varying vec3 vNormal, vView, vShell;
          void main() {
            vec3 size = vec3(0.65*uShape.x,0.68*uShape.y,0.40)*uRopeRadius;
            vec3 p = position*size + vec3(uApex.x,0.69*uRopeRadius*uShape.y,uApex.z);
            vec4 mv = modelViewMatrix * vec4(worldPoint(p),1.0);
            vNormal = normalMatrix*basis(normal/size); vView = -mv.xyz; vShell = position;
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: `${commonShader}
          uniform vec3 uGold;
          varying vec3 vNormal, vView, vShell;
          void main() {
            float rim = pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.8);
            float cap = smoothstep(-0.1,0.55,vShell.y);
            float texture = 0.55+0.45*noise(vShell.xy*14.0+uSeed*8.0);
            float alpha = rim*cap*texture*uReconnection*uOpacity*0.27/sqrt(uRopeRadius);
            gl_FragColor = vec4(uGold,alpha);
            #include <colorspace_fragment>
          }`,
      }), '日冕抛射稀薄前缘')
      add(ribbonGeometry, new ShaderMaterial({
        uniforms: { ...uniforms, uBranch: { value: 2 } }, ...ribbonShaders, ...transparentPlasma,
      }), '重联后拱廊')
      add(ribbonGeometry, new ShaderMaterial({
        uniforms: { ...uniforms, uBranch: { value: 1 } }, ...ribbonShaders, ...transparentPlasma,
      }), '重联后上升磁通')
      add(sheetGeometry, new ShaderMaterial({
        uniforms, ...transparentPlasma,
        vertexShader: `${commonShader}
          uniform vec3 uNeck;
          uniform vec2 uShape;
          varying vec2 vSheet;
          void main() {
            float top = uNeck.y + 0.22*max(0.0,uRopeRadius-1.8)*uShape.y;
            vec3 p = vec3(uNeck.x+position.x*0.055, mix(0.60*uShape.y,top,(position.y+1.0)*0.5),uNeck.z);
            vSheet = position.xy;
            gl_Position = projectionMatrix*modelViewMatrix*vec4(worldPoint(p),1.0);
          }`,
        fragmentShader: `${commonShader}
          uniform vec3 uGold;
          varying vec2 vSheet;
          void main() {
            float edge = exp(-vSheet.x*vSheet.x*8.0);
            float ends = max(0.0,1.0-vSheet.y*vSheet.y);
            float plasmoids = pow(0.5+0.5*sin(abs(vSheet.y)*28.0-uAge*7.0),6.0);
            gl_FragColor = vec4(uGold,edge*ends*uReconnection*uOpacity*(0.05+0.20*plasmoids));
            #include <colorspace_fragment>
          }`,
      }), '重联电流片')
    }
    return { uniforms, channel, cme, parcels, model, texture, index, lastAge: -1, seed: channel.seed, morphology: channel.morphology }
  })
  return {
    root,
    layout(layout: ReturnType<typeof getStructureLayout>, width = 1280, height = 720) {
      localWorldHeight = null
      limb.layout(layout)
      viewWidth = layout.width; viewHeight = layout.height; sunRadius = layout.sunRadius
      pixelWidth = width; pixelHeight = height
    },
    /** 文档/独立预览：在局部日面切平面展示一个通道，沿用同一模型、路径与材质。 */
    layoutLocal(width: number, height: number, worldHeight: number) {
      pixelWidth = Math.max(1, width); pixelHeight = Math.max(1, height)
      localWorldHeight = Math.max(0.01, worldHeight)
    },
    update() {
      for (const patch of patches) {
        const { uniforms: u, channel: c, parcels } = patch
        u.uAge.value = c.age
        if (c.opacity <= 0) { u.uOpacity.value = 0; continue }
        if (patch.seed !== c.seed || patch.morphology !== c.morphology || c.age < patch.lastAge) {
          patch.model = createFluxRopeSimulation(c.seed, patch.cme, c.morphology)
          patch.texture.image.data = patch.model.curveData
          patch.seed = c.seed
          patch.morphology = c.morphology
        }
        patch.lastAge = c.age
        patch.model.advanceTo(c.age)
        patch.texture.needsUpdate = true
        const model = patch.model, r = model.torus.radius
        if (localWorldHeight !== null) {
          u.uAnchor.value.set(0, 0, 0); u.uTangent.value.set(1, 0, 0); u.uNormal.value.set(0, 1, 0)
          u.uScale.value = 1; u.uUnitPixels.value = pixelHeight / localWorldHeight
          u.uRadius.value = 1e6 // 局部切平面，不在文档视口叠加整颗恒星的曲率。
        } else {
          limb.sample(c.position, u.uAnchor.value, u.uTangent.value, u.uNormal.value)
          const distance = STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ
          const projectionScale = (distance - u.uAnchor.value.z) / distance
          const scale = Math.min(viewWidth * (patch.cme ? 0.018 : 0.028), viewHeight * (patch.cme ? 0.035 : 0.050)) * (0.9 + c.seed * 0.2) * (patch.index === 1 ? 0.58 : 1)
          u.uScale.value = scale * projectionScale
          u.uUnitPixels.value = scale / viewHeight * pixelHeight
          u.uRadius.value = sunRadius
        }
        u.uPixelSize.value.set(1 / pixelWidth, 1 / pixelHeight)
        u.uAge.value = c.age; u.uSeed.value = c.seed; u.uOpacity.value = c.opacity
        u.uRopeRadius.value = r
        // 展示用重联进度；各通道的连接切换由相同的径向阶段决定。
        u.uReconnection.value = magneticEase((magneticStage(r, 5, c.seed) - 0.20) / 0.80)
        u.uShape.value.set(model.shape.span, model.shape.height)
        model.sample(MAGNETIC.cut, 0, 0, u.uNeck.value)
        model.sample(0.5, 0, 0, u.uApex.value)
        const centers = parcels.getAttribute('aCenter') as InstancedBufferAttribute
        const directions = parcels.getAttribute('aDirection') as InstancedBufferAttribute
        const states = parcels.getAttribute('aState') as InstancedBufferAttribute
        centers.array.set(model.centers); directions.array.set(model.tangents)
        let condensation = 0
        for (let i = 0; i < PLASMA_COUNT; i++) {
          states.setXYZ(i, model.temperature[i], model.density[i], (i * 0.6180339) % 1)
          condensation += Math.max(0, 1 - model.temperature[i]) / PLASMA_COUNT
        }
        u.uCondensation.value = condensation
        centers.needsUpdate = true; directions.needsUpdate = true; states.needsUpdate = true
      }
    },
    dispose() {
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      textures.forEach(texture => texture.dispose())
    },
  }
}
