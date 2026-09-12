import { AdditiveBlending, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three'
import { createCmeTailPool, cmeTailOpacity, sampleCmeTail } from '../../behaviors/stellarTail'
import { CME_TAIL } from '../../behaviors/stellarParticleDensity'
import { CME_PARTICLE_STYLE, STELLAR_PARTICLE_DIAMETER_PX } from './stellarParticleAppearance'

/** 独立于喷发透明度的一批持久尾迹；仍由同一场景时钟更新并由活动资产统一释放。 */
export function createCmeTailVisual(commonShader: string, color: ShaderMaterial['uniforms'][string]) {
  const pool = createCmeTailPool(), point = new Vector3()
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,-1,1,0,1,-1,0,1,1,0,-1,1,0]), 3))
  const centers = new InstancedBufferAttribute(new Float32Array(CME_TAIL.capacity * 3), 3)
  const appearances = new InstancedBufferAttribute(new Float32Array(CME_TAIL.capacity * 4), 4)
  const styles = new InstancedBufferAttribute(new Float32Array(CME_TAIL.capacity * 2), 2)
  geometry.setAttribute('aCenter', centers); geometry.setAttribute('aAppearance', appearances); geometry.setAttribute('aStyle', styles)
  geometry.instanceCount = 0
  const material = new ShaderMaterial({
    uniforms: { uPixelSize: { value: new Vector2(1 / 1280, 1 / 720) }, uColor: color },
    transparent: true, depthTest: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: `
      uniform vec2 uPixelSize;
      attribute vec3 aCenter;
      attribute vec4 aAppearance;
      attribute vec2 aStyle;
      varying vec2 vUv, vStyle;
      varying vec4 vAppearance;
      void main() {
        gl_Position=projectionMatrix*modelViewMatrix*vec4(aCenter,1.0);
        float radius=0.5*mix(${STELLAR_PARTICLE_DIAMETER_PX.min},${STELLAR_PARTICLE_DIAMETER_PX.max},aStyle.y);
        gl_Position.xy+=position.xy*radius*uPixelSize*2.0*gl_Position.w;
        vUv=position.xy; vStyle=aStyle; vAppearance=aAppearance;
      }`,
    fragmentShader: `${commonShader}
      uniform vec3 uColor;
      varying vec2 vUv, vStyle;
      varying vec4 vAppearance;
      void main() {
        float radius=dot(vUv,vUv);
        float edge=exp(-radius*3.6)*(1.0-smoothstep(0.64,1.0,radius));
        float emission=filamentEmissionAt(0.22+0.56*vAppearance.x,vAppearance.y,vAppearance.w,vAppearance.z,0.5)*0.9;
        float accent=step(${(1 - CME_PARTICLE_STYLE.accentFraction).toFixed(4)},vStyle.y);
        vec3 tint=uColor*mix(${CME_PARTICLE_STYLE.baseIntensity},1.0,accent);
        gl_FragColor=vec4(tint,edge*vStyle.x*min(${CME_PARTICLE_STYLE.maxEmission},emission*${CME_PARTICLE_STYLE.coverageGain}));
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'CME 长寿命尾迹'; mesh.renderOrder = 3; mesh.frustumCulled = false
  return { mesh, pool,
    update(time: number, width: number, height: number, pixelWidth: number, pixelHeight: number) {
      pool.expire(time)
      let count = 0
      for (const record of pool.records) {
        if (!record) continue
        const opacity = cmeTailOpacity(record, time)
        if (opacity <= 0) continue
        sampleCmeTail(record, time, point)
        centers.setXYZ(count, point.x * width, point.y * height, point.z * height)
        appearances.setXYZW(count, ...record.appearance)
        styles.setXY(count, opacity, record.random); count++
      }
      geometry.instanceCount = count
      centers.needsUpdate = true; appearances.needsUpdate = true; styles.needsUpdate = true
      material.uniforms.uPixelSize.value.set(1 / pixelWidth, 1 / pixelHeight)
    },
    dispose() { pool.clear(); geometry.dispose(); material.dispose() },
  }
}
