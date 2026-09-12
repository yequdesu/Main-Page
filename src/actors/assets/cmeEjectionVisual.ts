import { AdditiveBlending, BufferAttribute, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3 } from 'three'
import { CME_DISSOLUTION, cmeParticleVisibility, type createCmeDissolution } from '../../behaviors/stellarEjection'
import { magneticEase } from '../../behaviors/stellarMagnetism'
import { createCmeMistField } from '../../behaviors/stellarMist'
import { CME_TAIL } from '../../behaviors/stellarParticleDensity'
import { CME_MIST_COLORS, CME_MIST_OPACITY, CME_MIST_RADIUS_SCALE, CME_PARTICLE_STYLE, STELLAR_PARTICLE_DIAMETER_PX } from './stellarParticleAppearance'

/** 三维外流粒子与稀薄发光雾片；与 CME 共用局部坐标、时钟及显隐。所有权交给 stellarActivity。 */
export function createCmeEjectionVisual(commonShader: string, uniforms: ShaderMaterial['uniforms']) {
  const geometries: InstancedBufferGeometry[] = [], materials: ShaderMaterial[] = []
  const mistField = createCmeMistField(CME_MIST_RADIUS_SCALE)
  const cloud = {
    uMistCenter: { value: new Vector3() }, uMistAge: { value: 0 },
    uMistWarm: { value: new Color(CME_MIST_COLORS.warm) }, uMistCool: { value: new Color(CME_MIST_COLORS.cool) },
  }
  const meshes = [false, true].map(mist => {
    const count = CME_DISSOLUTION.count / (mist ? CME_DISSOLUTION.fogStride : CME_DISSOLUTION.particleStride)
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,-1,1,0,1,-1,0,1,1,0,-1,1,0]), 3))
    for (const name of ['aCenter', 'aMotion']) geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('aLife', new InstancedBufferAttribute(new Float32Array(count * 4), 4))
    geometry.setAttribute('aVisibility', new InstancedBufferAttribute(new Float32Array(count), 1))
    geometry.setAttribute('aMist', new InstancedBufferAttribute(mist ? mistField.kernels : new Float32Array(count * 3), 3))
    geometry.instanceCount = mist ? count : 0
    geometries.push(geometry)
    const material = new ShaderMaterial({
      uniforms: { ...uniforms, ...cloud, uMist: { value: mist ? 1 : 0 } },
      transparent: true, depthWrite: false, depthTest: true, blending: AdditiveBlending,
      vertexShader: `${commonShader}
        uniform float uMist, uUnitPixels;
        uniform vec3 uMistCenter;
        uniform vec2 uPixelSize;
        attribute vec3 aCenter, aMotion, aMist;
        attribute vec4 aLife;
        attribute float aVisibility;
        varying vec2 vUv;
        varying vec4 vLife;
        varying vec3 vMistPoint;
        varying float vMistWeight;
        varying float vVisibility;
        void main() {
          // 雾核中心始终跟随实际外流样本；连续性由自适应覆盖保证。
          vec4 mv = modelViewMatrix * vec4(worldPoint(aCenter),1.0);
          vec3 motion = mat3(modelViewMatrix)*basis(aMotion);
          vec2 along=normalize(motion.xy+vec2(0.00001,0.00002));
          vec2 across=vec2(-along.y,along.x);
          float elapsed=max(0.0,aLife.x);
          vec2 extent;
          if(uMist>0.5) {
            extent=(along*position.x*aMist.y+across*position.y)*aMist.x*uUnitPixels;
          } else {
            // uPixelSize 使用 CSS 视口尺寸；裁剪空间偏移自然适配 DPR，不再乘像素密度。
            float radiusPx=0.5*mix(${STELLAR_PARTICLE_DIAMETER_PX.min},${STELLAR_PARTICLE_DIAMETER_PX.max},aLife.z);
            float stretch=1.0+min(0.15,length(aMotion)*0.06)*smoothstep(0.6,1.2,elapsed);
            extent=(along*position.x*stretch+across*position.y)*radiusPx;
          }
          gl_Position=projectionMatrix*mv;
          gl_Position.xy+=extent*uPixelSize*2.0*gl_Position.w;
          // 所有雾片在同一随流坐标场取样，交叠区域不再各画一块独立噪声。
          vec3 offset=vec3(extent/max(0.001,uUnitPixels),0.0);
          mat3 viewBasis=mat3(modelViewMatrix);
          vMistPoint=aCenter-uMistCenter+vec3(dot(offset,viewBasis*uTangent),dot(offset,viewBasis*uNormal),dot(offset,viewBasis*cross(uTangent,uNormal)));
          vMistWeight=aMist.z;
          vVisibility=aVisibility;
          vUv=position.xy; vLife=aLife;
        }`,
      fragmentShader: `${commonShader}
        uniform float uMist, uMistStrength;
        uniform float uMistAge;
        uniform vec3 uColor, uMistWarm, uMistCool;
        varying vec2 vUv;
        varying vec4 vLife;
        varying vec3 vMistPoint;
        varying float vMistWeight;
        varying float vVisibility;
        void main() {
          float elapsed=vLife.x;
          if(elapsed<0.0) discard;
          float conversion=cmeConversion(elapsed,vLife.y);
          float radius=dot(vUv,vUv);
          float edge=exp(-radius*3.6)*(1.0-smoothstep(0.64,1.0,radius));
          float alpha;
          vec3 tint;
          if(uMist>0.5) {
            vec3 p=vMistPoint*1.4;
            float swirl=0.6+0.4*noise(p.xy+vec2(uAge*0.13,-uAge*0.08));
            swirl*=0.8+0.2*noise(p.yz*1.8-vec2(uAge*0.09,uAge*0.06));
            float life=smoothstep(0.15,0.9,uMistAge)*(1.0-smoothstep(2.4,${CME_DISSOLUTION.mistEnd},uMistAge));
            float birth=smoothstep(0.0,0.55,elapsed);
            float wake=1.0-0.25*smoothstep(-0.6,0.8,vUv.x);
            alpha=edge*swirl*life*birth*wake*vMistWeight*${CME_MIST_OPACITY}*uMistStrength/pow(1.0+max(0.0,uMistAge-0.6),0.65);
            // 去相关微抖动，避免大量低不透明度雾片在 8-bit 画布上叠出同心色带。
            alpha*=2.0*hash(gl_FragCoord.xy+vec2(vLife.z*173.0,vLife.w*31.0));
            tint=mix(uMistWarm,uMistCool,${CME_MIST_COLORS.coolMix});
          } else {
            float life=1.0-smoothstep(${CME_DISSOLUTION.particleFadeStart},${CME_DISSOLUTION.particleEnd},elapsed);
            float accent=step(${(1 - CME_PARTICLE_STYLE.accentFraction).toFixed(4)},vLife.z);
            float emission=filamentEmission(0.22+0.56*vLife.y,vLife.w)*arcadeCooling(elapsed);
            alpha=edge*conversion*life*vVisibility*min(${CME_PARTICLE_STYLE.maxEmission},emission*${CME_PARTICLE_STYLE.coverageGain});
            tint=uColor*mix(${CME_PARTICLE_STYLE.baseIntensity},1.0,accent);
          }
          gl_FragColor=vec4(tint,alpha*uOpacity*uEjection);
          #include <colorspace_fragment>
        }`,
    })
    materials.push(material)
    const mesh = new Mesh(geometry, material)
    mesh.name = mist ? 'CME 逸散薄雾' : 'CME 闭环逸散粒子'
    mesh.renderOrder = mist ? 2 : 3
    mesh.frustumCulled = false
    return mesh
  })
  return { meshes, geometries, materials,
    update(state: ReturnType<typeof createCmeDissolution>) {
      mistField.update(state)
      const mistAttribute = geometries[1].getAttribute('aMist') as InstancedBufferAttribute
      mistAttribute.needsUpdate = true
      // 共同中心只作为噪声坐标原点；不再改变雾核位置或限制其扩散。
      const centroid = cloud.uMistCenter.value
      centroid.set(0, 0, 0)
      let weight = 0, age = 0
      for (let i = 0; i < CME_DISSOLUTION.count; i += CME_DISSOLUTION.fogStride) {
        const w = magneticEase(state.ages[i] / 0.55), k = i * 3
        if (w <= 0) continue
        const x = state.positions[k], y = state.positions[k + 1], z = state.positions[k + 2]
        weight += w; age += w * state.ages[i]
        centroid.x += w * x; centroid.y += w * y; centroid.z += w * z
      }
      if (weight > 0) centroid.divideScalar(weight)
      cloud.uMistAge.value = weight > 0 ? age / weight : 0
      for (let layer = 0; layer < geometries.length; layer++) {
        const geometry = geometries[layer], stride = layer ? CME_DISSOLUTION.fogStride : CME_DISSOLUTION.particleStride
        const center = geometry.getAttribute('aCenter') as InstancedBufferAttribute
        const motion = geometry.getAttribute('aMotion') as InstancedBufferAttribute
        const life = geometry.getAttribute('aLife') as InstancedBufferAttribute
        const visibility = geometry.getAttribute('aVisibility') as InstancedBufferAttribute
        // 底部出生时未被选中的颗粒不提交实例；雾仍读取完整的独立采样。
        let j = 0
        life.array.fill(-1)
        for (let i = 0; i < CME_DISSOLUTION.count; i += stride) {
          if (!layer && !state.particleEnabled[i]) continue
          let fade = layer ? 1 : cmeParticleVisibility(state.ages[i], state.coordinates[i], i, Boolean(state.particleTail[i]))
          if (!layer && state.tailTransferTimes[i] >= 0) {
            const time = state.ages[i] + state.closureTimes[Math.floor(i / CME_DISSOLUTION.perStrand)]
            fade *= 1 - magneticEase((time - state.tailTransferTimes[i]) / CME_TAIL.crossfade)
          }
          if (!layer && fade <= 0) continue
          const k = i * 3
          center.setXYZ(j, state.positions[k], state.positions[k + 1], state.positions[k + 2])
          motion.setXYZ(j, state.velocities[k], state.velocities[k + 1], state.velocities[k + 2])
          life.setXYZW(j, state.ages[i], state.coordinates[i], (i * 0.754877 + 0.37) % 1, Math.floor(i / CME_DISSOLUTION.perStrand))
          visibility.setX(j, fade)
          j++
        }
        geometry.instanceCount = j
        center.needsUpdate = true; motion.needsUpdate = true; life.needsUpdate = true; visibility.needsUpdate = true
      }
    },
  }
}
