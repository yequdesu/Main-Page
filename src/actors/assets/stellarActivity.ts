import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, ShaderMaterial, Vector2, Vector3,
  InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry, SphereGeometry, DataTexture, FloatType, RGBAFormat, NearestFilter,
} from 'three'
import { createStellarLimbFrame, type createStellarActivityChannels } from '../../behaviors/stellarActivity'
import { createProminencePlacement } from '../../behaviors/stellarPlacement'
import { createFluxRopeSimulation, PLASMA, PLASMA_COUNT } from '../../behaviors/stellarPlasma'
import { MAGNETIC, magneticEase, magneticStage } from '../../behaviors/stellarMagnetism'
import { CME_DISSOLUTION, cmeConversion } from '../../behaviors/stellarEjection'
import { CME_SCREEN_SCALE, CME_TAIL } from '../../behaviors/stellarParticleDensity'
import { createCmeEjectionVisual } from './cmeEjectionVisual'
import { createCmeTailVisual } from './cmeTailVisual'
import { STRUCTURE_LAYOUT, type getStructureLayout } from '../../behaviors/structureLayout'

export const STELLAR_ACTIVITY_STYLE = {
  filamentColor: '#edab68',
  particleColor: '#ffd34d',
  particleHighlight: '#fff0a3',
  particleCount: PLASMA_COUNT,
} as const

const commonShader = `
  uniform vec3 uAnchor, uTangent, uNormal;
  uniform float uClosureTimes[12], uEjection, uFirstClosure;
  float cmeConversion(float elapsed,float s) {
    float t=clamp((elapsed-${CME_DISSOLUTION.delay}-${CME_DISSOLUTION.propagation}*pow(sin(3.14159265*s),2.0))/${CME_DISSOLUTION.conversion},0.0,1.0);
    return t*t*t*(10.0+t*(-15.0+6.0*t));
  }
  uniform float uScale, uRadius, uAge, uSeed, uOpacity, uRopeRadius, uReconnection, uCondensation, uCme;
  vec3 basis(vec3 p) { return uTangent * p.x + uNormal * p.y + cross(uTangent, uNormal) * p.z; }
  vec3 worldPoint(vec3 p) {
    vec3 result = uAnchor + basis(p) * uScale;
    float drop = p.x * p.x * uScale * uScale / (2.0 * uRadius);
    if (uCme < 0.5) {
      // 两个切向分量共同贴球面，方位旋转后足点不会因纵深而悬空。
      float r2 = dot(p.xz, p.xz) * uScale * uScale;
      drop = r2 / (uRadius + sqrt(max(0.000001, uRadius * uRadius - r2)));
    }
    result -= uNormal * (drop + uScale * 0.014);
    return result;
  }
  vec3 worldDirection(vec3 p, vec3 direction) {
    vec3 result = basis(direction);
    if (uCme < 0.5) {
      float r2 = dot(p.xz, p.xz) * uScale * uScale;
      result -= uNormal * dot(p.xz, direction.xz) * uScale / sqrt(max(0.000001, uRadius * uRadius - r2));
    }
    return result;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  // 弧丝与逸散颗粒共用密度和发光标尺，避免颗粒化后突然变成高亮光点。
  float directedFilamentEmission(float t,float strand,float age,float seed,float condensation,float direction) {
    float filaments=noise(vec2(t*27.0-direction*age*0.7,strand*3.7+seed*7.0));
    filaments*=noise(vec2(t*61.0-direction*age*0.45,strand+seed*9.0))*0.5+0.5;
    float dip=exp(-pow((t-0.5)/0.24,4.0));
    return (0.09+filaments*(0.40+dip*condensation*0.7))*0.75;
  }
  float filamentEmissionAt(float t,float strand,float age,float seed,float condensation) {
    return directedFilamentEmission(t,strand,age,seed,condensation,mod(strand,2.0)*2.0-1.0);
  }
  float filamentEmission(float t,float strand) {
    return filamentEmissionAt(t,strand,uAge,uSeed,uCondensation);
  }
  float arcadeCooling(float elapsed) {
    return mix(1.0,0.55,smoothstep(0.7,4.0,elapsed)*uEjection);
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
  geometry.setAttribute('aVisibility', new InstancedBufferAttribute(new Float32Array(PLASMA_COUNT), 1))
  geometry.setAttribute('aConversion', new InstancedBufferAttribute(new Float32Array(PLASMA_COUNT), 1))
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
  let lastTime = -1
  let cmeRotationEnabled = true
  const tailPoint = new Vector3(), tailVelocity = new Vector3(), binormal = new Vector3()
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
    const model = createFluxRopeSimulation(channel.seed, cme, channel.morphology, channel.duration)
    const texture = new DataTexture(model.curveData, MAGNETIC.samples, MAGNETIC.strands * model.branchCount, RGBAFormat, FloatType)
    texture.minFilter = NearestFilter; texture.magFilter = NearestFilter
    texture.needsUpdate = true
    textures.push(texture)
    const redrawTexture = cme ? null : new DataTexture(model.redrawData, MAGNETIC.samples, MAGNETIC.strands * model.branchCount, RGBAFormat, FloatType)
    if (redrawTexture) {
      redrawTexture.minFilter = NearestFilter; redrawTexture.magFilter = NearestFilter
      redrawTexture.needsUpdate = true; textures.push(redrawTexture)
    }
    const uniforms = {
      uAnchor: { value: new Vector3() }, uTangent: { value: new Vector3() }, uNormal: { value: new Vector3() },
      uScale: { value: 1 }, uRadius: { value: 1 }, uAge: { value: 0 }, uSeed: { value: 0 }, uOpacity: { value: 0 },
      uRopeRadius: { value: 1 }, uReconnection: { value: 0 }, uCondensation: { value: 0 }, uCme: { value: cme ? 1 : 0 },
      uPixelSize: { value: new Vector2() }, uUnitPixels: { value: 1 }, uBranch: { value: 0 },
      uClosureTimes: { value: new Float32Array(12).fill(-1) }, uEjection: { value: 1 }, uMistStrength: { value: 1 }, uFirstClosure: { value: -1 },
      uCurves: { value: texture }, uNeck: { value: new Vector3() }, uApex: { value: new Vector3() },
      uRotation: { value: new Vector3(0, 0, 1) }, uRotationCenter: { value: new Vector2() }, uRotationProfile: { value: 1 },
      uRedraw: { value: redrawTexture ?? texture }, uShowRedraw: { value: 0 },
      uShape: { value: new Vector2(model.shape.span, model.shape.height) },
      uColor: { value: new Color(STELLAR_ACTIVITY_STYLE.filamentColor) },
      uGold: { value: new Color(STELLAR_ACTIVITY_STYLE.particleColor) },
      uHighlight: { value: new Color(STELLAR_ACTIVITY_STYLE.particleHighlight) },
    }
    const ribbonShaders = {
      vertexShader: `${commonShader}
        uniform sampler2D uCurves, uRedraw;
        uniform float uBranch;
        varying vec3 vRibbon;
        varying float vVisible, vPulse, vField;
        varying vec2 vFlow;
        vec4 curve(float t,float strand) {
          float cell=t*${(MAGNETIC.samples - 1).toFixed(1)}, lo=min(${(MAGNETIC.samples - 2).toFixed(1)},floor(cell));
          float row=(uBranch*12.0+strand+0.5)/${(MAGNETIC.strands * model.branchCount).toFixed(1)};
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
          vec3 viewDirection=mat3(modelViewMatrix)*worldDirection(point.xyz,direction);
          vec2 across=normalize(vec2(-viewDirection.y,viewDirection.x)+vec2(0.000001));
          mv.xy+=across*position.y*point.w*uScale*(0.8+0.4*uCondensation);
          gl_Position=projectionMatrix*mv;
          float source=t;
          if(uCme>0.5 && uBranch>1.5) source=t<0.5 ? 0.44*t : 1.0-0.44*(1.0-t);
          else if(uCme>0.5 && uBranch>0.5) source=0.22+0.56*t;
          vRibbon=vec3(source,position.y,strand);
          float stage=clamp((uRopeRadius-(1.48+0.32*fract(strand*0.618+uSeed)))/1.38,0.0,1.0);
          float split=step(0.45,stage)*uCme;
          vec4 redraw=uCme>0.5 ? vec4(1.0,0.0,1.0,t) : texture2D(uRedraw,vec2((t*112.0+0.5)/113.0,(uBranch*12.0+strand+0.5)/${(MAGNETIC.strands * model.branchCount).toFixed(1)}));
          vVisible=uCme>0.5 ? (uBranch<0.5 ? 1.0-split : split) : redraw.r;
          vField=redraw.g; vFlow=redraw.ba;
          float closedAt=uClosureTimes[int(strand)];
          float afterClose=closedAt<0.0 ? -1.0 : uAge-closedAt;
          vPulse=exp(-pow((stage-0.45)/0.10,2.0))*uCme*(1.0-uEjection*smoothstep(0.04,0.30,afterClose));
        }`,
      fragmentShader: `${commonShader}
        uniform vec3 uColor, uHighlight;
        uniform float uBranch, uShowRedraw;
        varying vec3 vRibbon;
        varying float vVisible, vPulse, vField;
        varying vec2 vFlow;
        void main() {
          float t=vRibbon.x, strand=vRibbon.z;
          if(vVisible<0.002) discard;
          float dilution=(uCme>0.5 && uBranch>1.5) ? 1.0 : pow(uRopeRadius,0.65);
          float emission=(uCme>0.5 ? filamentEmission(t,strand) : directedFilamentEmission(vFlow.y,strand,uAge,uSeed,uCondensation,vFlow.x))/dilution;
          float edge=exp(-vRibbon.y*vRibbon.y*4.0)*(1.0-smoothstep(0.7,1.0,abs(vRibbon.y)));
          float feet=smoothstep(0.0,0.045,t)*(1.0-smoothstep(0.955,1.0,t));
          float neck=exp(-pow((abs(t-0.5)-0.28)/0.045,2.0))*vPulse;
          float elapsed=uClosureTimes[int(strand)]<0.0 ? -1.0 : uAge-uClosureTimes[int(strand)];
          float transfer=(uCme>0.5 && uBranch>0.5 && uBranch<1.5) ? cmeConversion(elapsed,(t-0.22)/0.56)*uEjection : 0.0;
          float cooling=(uCme>0.5 && uBranch>1.5) ? arcadeCooling(elapsed) : 1.0;
          float alpha=(emission+neck*0.35*0.75)*edge*feet*uOpacity*vVisible*(1.0-transfer)*cooling;
          vec3 tint=mix(uColor,uHighlight,neck*0.5);
          if(uShowRedraw>0.5 && uCme<0.5) {
            tint=mix(vec3(0.12,0.68,0.82),vec3(1.0,0.43,0.16),vField);
            alpha=edge*feet*uOpacity*vVisible*0.65;
          }
          gl_FragColor=vec4(tint,alpha);
          #include <colorspace_fragment>
        }`,
    }
    add(ribbonGeometry, new ShaderMaterial({ uniforms, ...ribbonShaders, ...transparentPlasma }), cme ? '日冕抛射弧丝' : `日珥弧丝_${index}`)
    if (!cme) for (const branch of [1, 2, 3]) add(ribbonGeometry, new ShaderMaterial({
      uniforms: { ...uniforms, uBranch: { value: branch } }, ...ribbonShaders, ...transparentPlasma,
    }), `日珥重绘短环_${index}_${branch}`)
    const parcels = createParcelGeometry()
    geometries.push(parcels)
    add(parcels, new ShaderMaterial({
      uniforms, ...transparentPlasma,
      vertexShader: `${commonShader}
        uniform vec2 uPixelSize;
        uniform float uUnitPixels;
        attribute vec3 aCenter, aDirection, aState;
        attribute float aConversion, aVisibility;
        varying float vConversion, vVisibility;
        varying vec2 vParticle;
        varying vec3 vState;
        void main() {
          vec4 mv = modelViewMatrix * vec4(worldPoint(aCenter),1.0);
          vec3 dir = mat3(modelViewMatrix) * worldDirection(aCenter,aDirection);
          vec2 along = normalize(dir.xy + vec2(0.00001));
          vec2 across = vec2(-along.y,along.x);
          float cold = 1.0 - smoothstep(0.15,0.85,aState.x);
          float halfLength = max(1.2,uUnitPixels*(0.035+0.055*cold));
          float halfWidth = max(0.48,uUnitPixels*(0.018+0.012*cold));
          gl_Position = projectionMatrix * mv;
          gl_Position.xy += (along*position.x*halfLength + across*position.y*halfWidth)*uPixelSize*2.0*gl_Position.w;
          vParticle = position.xy; vState = aState; vConversion=aConversion; vVisibility=aVisibility;
        }`,
      fragmentShader: `${commonShader}
        uniform vec3 uColor, uGold, uHighlight;
        uniform float uShowRedraw;
        varying vec2 vParticle;
        varying vec3 vState;
        varying float vConversion, vVisibility;
        void main() {
          if(vVisibility<0.002) discard;
          float glow = exp(-vParticle.y*vParticle.y*4.5)*pow(max(0.0,1.0-vParticle.x*vParticle.x),1.2);
          float cold = 1.0-smoothstep(0.15,0.85,vState.x);
          float emission = min(1.0,pow(vState.y,0.65))*(0.22+0.78*cold);
          emission = mix(emission,min(1.0,pow(vState.y,0.40))*(0.6+0.4*cold),uCme);
          vec3 tint = mix(uColor,mix(uGold,uHighlight,vState.z*0.22),uCme);
          gl_FragColor = vec4(tint,glow*emission*uOpacity*vVisibility*0.95*(1.0-vConversion*uEjection)*(1.0-0.8*uShowRedraw));
          #include <colorspace_fragment>
        }`,
    }), cme ? '日冕抛射金色粒子' : `日珥等离子体_${index}`, 3)
    const ejectionVisual = cme ? createCmeEjectionVisual(commonShader, uniforms) : null
    if (ejectionVisual) {
      root.add(...ejectionVisual.meshes)
      geometries.push(...ejectionVisual.geometries); materials.push(...ejectionVisual.materials)
    }
    if (cme) {
      add(shellGeometry, new ShaderMaterial({
        uniforms, ...transparentPlasma,
        vertexShader: `${commonShader}
          uniform vec3 uApex;
          uniform vec2 uShape;
          uniform vec3 uRotation;
          uniform vec2 uRotationCenter;
          uniform float uRotationProfile;
          varying vec3 vNormal, vView, vShell;
          void main() {
            vec3 size = vec3(0.65*uShape.x,0.68*uShape.y,0.40)*uRopeRadius;
            vec3 p = position*size + vec3(uApex.x,0.69*uRopeRadius*uShape.y,uApex.z);
            // 与 CPU 路径同一高度扭转；法线使用空间映射的逆转置。
            float h=clamp((p.y-uRotation.y)/uRotation.z,0.0,1.0);
            float e=h*h*h*(10.0+h*(-15.0+6.0*h));
            float angle=uRotation.x*pow(e,uRotationProfile);
            float derivative=e>0.0 ? uRotation.x*uRotationProfile*pow(e,uRotationProfile-1.0)*30.0*h*h*(1.0-h)*(1.0-h)/uRotation.z : 0.0;
            mat2 turn=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
            vec2 offset=turn*(p.xz-uRotationCenter);
            p.xz=uRotationCenter+offset;
            vec3 n=normal/size;
            n.xz=turn*n.xz;
            n.y-=derivative*dot(vec2(-offset.y,offset.x),n.xz);
            vec4 mv = modelViewMatrix * vec4(worldPoint(p),1.0);
            vNormal = normalMatrix*basis(n); vView = -mv.xyz; vShell = position;
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: `${commonShader}
          uniform vec3 uGold;
          varying vec3 vNormal, vView, vShell;
          void main() {
            float rim = pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.8);
            float cap = smoothstep(-0.1,0.55,vShell.y);
            float texture = 0.55+0.45*noise(vShell.xy*14.0+uSeed*8.0);
            float elapsed=uClosureTimes[5]<0.0 ? -1.0 : uAge-uClosureTimes[5];
            float alpha = rim*cap*texture*uReconnection*uOpacity*0.27/sqrt(uRopeRadius)*(1.0-uEjection*smoothstep(0.0,0.8,elapsed));
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
            float sinceFirst=uFirstClosure<0.0 ? -1.0 : uAge-uFirstClosure;
            float fade=1.0-0.98*uEjection*smoothstep(0.0,0.45,sinceFirst);
            gl_FragColor = vec4(uGold,edge*ends*uReconnection*uOpacity*(0.05+0.20*plasmoids)*fade);
            #include <colorspace_fragment>
          }`,
      }), '重联电流片')
    }
    return { uniforms, channel, cme, parcels, model, texture, redrawTexture, index, ejectionVisual, placement: createProminencePlacement(channel.seed), rotationEnabled: true, lastAge: -1, seed: channel.seed, morphology: channel.morphology, duration: channel.duration, serial: channel.serial, exported: new Uint8Array(CME_DISSOLUTION.count) }
  })
  const tails = createCmeTailVisual(commonShader, patches[2].uniforms.uColor)
  root.add(tails.mesh)
  return {
    root,
    /** 返回首个普通通道最终三维路径的弧长统计；调用方复制后用于低频 UI 展示。 */
    getShortLoopDiagnostics() {
      const patch = patches[0], route = patch.model.reorganization
      return route && patch.channel.age >= route.plan.contact ? route.arcDiagnostics() : null
    },
    /** 改变几何需在下一次 update 按当前年龄重放，继续复用 GPU 缓冲。 */
    setCmeRotation(enabled: boolean) {
      cmeRotationEnabled = enabled
    },
    /** 诊断色仅显示丝线内外层次，不改变几何、随机流或模拟时钟。 */
    setRedrawDiagnostic(enabled: boolean) {
      for (const patch of patches) if (!patch.cme) patch.uniforms.uShowRedraw.value = enabled ? 1 : 0
    },
    /** 对照实验只改变可见表现，求解器与时钟保持同一实例。 */
    setEjectionAppearance(enabled: boolean, mistStrength = 1) {
      const u = patches[2].uniforms
      u.uEjection.value = enabled ? 1 : 0
      u.uMistStrength.value = Math.max(0, Math.min(2, mistStrength))
      tails.mesh.visible = enabled
    },
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
      const now = channels.time ?? channels.cme.age
      if (now < lastTime) { tails.pool.clear(); patches[2].exported.fill(0) }
      lastTime = now
      for (const patch of patches) {
        const { uniforms: u, channel: c, parcels } = patch
        u.uAge.value = c.age
        const rotationChanged = patch.cme && patch.rotationEnabled !== cmeRotationEnabled
        const reset = rotationChanged || patch.seed !== c.seed || patch.morphology !== c.morphology || patch.duration !== c.duration || c.age < patch.lastAge || patch.serial !== c.serial
        if (c.opacity <= 0 && (!patch.cme || (!reset && patch.lastAge >= CME_TAIL.eventEnd))) { u.uOpacity.value = 0; continue }
        if (reset) {
          if (patch.cme && channels.time === null) tails.pool.clear()
          patch.model = createFluxRopeSimulation(c.seed, patch.cme, c.morphology, c.duration, cmeRotationEnabled)
          patch.placement = createProminencePlacement(c.seed)
          patch.rotationEnabled = cmeRotationEnabled
          patch.texture.image.data = patch.model.curveData
          if (patch.redrawTexture) patch.redrawTexture.image.data = patch.model.redrawData
          patch.seed = c.seed
          patch.morphology = c.morphology
          patch.serial = c.serial
          patch.duration = c.duration
          patch.exported.fill(0)
        }
        patch.lastAge = c.age
        patch.model.advanceTo(c.age)
        patch.texture.needsUpdate = true
        if (patch.redrawTexture) patch.redrawTexture.needsUpdate = true
        const model = patch.model, r = model.torus.radius
        if (model.ejection) {
          u.uClosureTimes.value.set(model.ejection.closureTimes)
          let first = Infinity
          for (const time of model.ejection.closureTimes) if (time >= 0) first = Math.min(first, time)
          u.uFirstClosure.value = Number.isFinite(first) ? first : -1
        }
        if (localWorldHeight !== null) {
          u.uAnchor.value.set(0, 0, 0); u.uTangent.value.set(1, 0, 0); u.uNormal.value.set(0, 1, 0)
          u.uScale.value = 1; u.uUnitPixels.value = pixelHeight / localWorldHeight
          u.uRadius.value = 1e6 // 局部切平面，不在文档视口叠加整颗恒星的曲率。
        } else {
          limb.sample(c.position, u.uAnchor.value, u.uTangent.value, u.uNormal.value)
          if (!patch.cme) u.uTangent.value.applyAxisAngle(u.uNormal.value, patch.placement.azimuth)
          const distance = STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ
          const projectionScale = (distance - u.uAnchor.value.z) / distance
          const variation = patch.cme ? 0.9 + c.seed * 0.2 : patch.placement.scale
          const scale = Math.min(viewWidth * (patch.cme ? CME_SCREEN_SCALE.width : 0.028), viewHeight * (patch.cme ? CME_SCREEN_SCALE.height : 0.050)) * variation * (patch.index === 1 ? 0.58 : 1)
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
        if (model.rotation) {
          const rotation = model.rotation
          u.uRotation.value.set(rotation.angle, rotation.neckHeight, rotation.heightRange)
          u.uRotationCenter.value.set(rotation.centerX, rotation.centerZ)
          u.uRotationProfile.value = rotation.plan.profile
          // 前缘顶点在 shader 中统一扭转，中心不能预先扭转两次。
          rotation.apply(u.uApex.value, true)
        }
        const centers = parcels.getAttribute('aCenter') as InstancedBufferAttribute
        const directions = parcels.getAttribute('aDirection') as InstancedBufferAttribute
        const states = parcels.getAttribute('aState') as InstancedBufferAttribute
        const conversion = parcels.getAttribute('aConversion') as InstancedBufferAttribute
        const visibility = parcels.getAttribute('aVisibility') as InstancedBufferAttribute
        centers.array.set(model.centers); directions.array.set(model.tangents)
        let condensation = 0
        for (let i = 0; i < PLASMA_COUNT; i++) {
          const closedAt = model.ejection?.closureTimes[Math.floor(i / PLASMA.parcelsPerStrand)] ?? -1
          conversion.setX(i, model.branches[i] === 1 && closedAt >= 0 ? cmeConversion(c.age - closedAt, model.position[i]) : 0)
          states.setXYZ(i, model.temperature[i], model.density[i], (i * 0.6180339) % 1)
          visibility.setX(i, model.parcelVisibility[i])
          condensation += Math.max(0, 1 - model.temperature[i]) / PLASMA_COUNT
        }
        u.uCondensation.value = condensation
        conversion.needsUpdate = true
        visibility.needsUpdate = true
        centers.needsUpdate = true; directions.needsUpdate = true; states.needsUpdate = true
        if (model.ejection) {
          const state = model.ejection, eventStart = now - c.age
          const width = localWorldHeight === null ? viewWidth : 9, height = localWorldHeight === null ? viewHeight : 6.2
          binormal.crossVectors(u.uTangent.value, u.uNormal.value)
          for (let i = 0; i < state.particleTail.length; i += CME_DISSOLUTION.particleStride) {
            if (patch.exported[i] || state.tailTransferTimes[i] < 0) continue
            patch.exported[i] = 1
            const k = i * 3, scale = u.uScale.value
            const x = state.tailPositions[k], vx = state.tailVelocities[k]
            tailPoint.copy(u.uAnchor.value).addScaledVector(u.uTangent.value, x * scale)
              .addScaledVector(u.uNormal.value, state.tailPositions[k + 1] * scale - x * x * scale * scale / (2 * u.uRadius.value) - scale * 0.014)
              .addScaledVector(binormal, state.tailPositions[k + 2] * scale)
            tailVelocity.copy(u.uTangent.value).multiplyScalar(vx * scale)
              .addScaledVector(u.uNormal.value, state.tailVelocities[k + 1] * scale - x * vx * scale * scale / u.uRadius.value)
              .addScaledVector(binormal, state.tailVelocities[k + 2] * scale)
            const random = (i * 0.754877 + 0.37) % 1, speed = 0.0024 + 0.0012 * random
            tails.pool.add({
              born: eventStart + state.releaseTimes[i], depart: eventStart + state.tailTransferTimes[i],
              origin: [tailPoint.x / width, tailPoint.y / height, tailPoint.z / height],
              velocity: [tailVelocity.x / width, tailVelocity.y / height, tailVelocity.z / height],
              drift: localWorldHeight === null ? [speed, u.uNormal.value.y * 0.0005 + (random - 0.5) * 0.0003, 0] : [(random - 0.5) * 0.0003, speed, 0],
              wave: localWorldHeight === null ? [0.008, 0.02, 0.006] : [0.02, 0.008, 0.006],
              phase: c.seed * Math.PI * 2 + i * 0.618, random,
              appearance: [state.coordinates[i], Math.floor(i / CME_DISSOLUTION.perStrand), c.seed, state.tailTransferTimes[i]],
            }, now)
          }
          patch.ejectionVisual?.update(state)
        }
      }
      tails.update(now, localWorldHeight === null ? viewWidth : 9, localWorldHeight === null ? viewHeight : 6.2, pixelWidth, pixelHeight)
    },
    dispose() {
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      textures.forEach(texture => texture.dispose())
      tails.dispose()
    },
  }
}
