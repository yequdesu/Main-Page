import { Color, Vector3, type Material, type Object3D } from 'three'
import { CENTRAL_STAR_CORE_RADIUS, type createCentralStarAsset } from './centralStar'

/** 仅用于 Act 4 的同源资产特写材质与动画参数。 */
export const STELLAR_CLOSEUP = {
  frequencyScale: 0.15,
  innerOpacity: 0.15,
  nearOpacity: 0.20,
  farOpacity: 0.20,
  coreColor: '#ffe4b0',
  limbColor: '#edab58',
} as const

export function configureStellarCloseup(asset: ReturnType<typeof createCentralStarAsset>) {
  const center = { value: new Vector3() }
  const radius = { value: CENTRAL_STAR_CORE_RADIUS }
  const scale = new Vector3()
  const updateUniforms: Object3D['onBeforeRender'] = (_renderer, _scene, camera) => {
    center.value.setFromMatrixPosition(asset.core.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
    radius.value = CENTRAL_STAR_CORE_RADIUS * scale.setFromMatrixScale(asset.core.matrixWorld).x
  }

  asset.core.material.color.set(STELLAR_CLOSEUP.coreColor)
  asset.core.material.onBeforeCompile = shader => {
    shader.uniforms.uLimbColor = { value: new Color(STELLAR_CLOSEUP.limbColor) }
    shader.vertexShader = `varying vec3 vStarNormal; varying vec3 vStarView;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', '#include <project_vertex>\nvStarNormal = normalMatrix * normal; vStarView = mvPosition.xyz;')
    shader.fragmentShader = `uniform vec3 uLimbColor; varying vec3 vStarNormal; varying vec3 vStarView;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mu = max(0.0, dot(normalize(vStarNormal), normalize(-vStarView)));
        diffuseColor.rgb = mix(uLimbColor, diffuseColor.rgb, pow(mu, 0.45));`)
  }
  asset.core.material.customProgramCacheKey = () => 'stellar-closeup-core-v1'
  asset.core.material.needsUpdate = true

  function edgeGlow(material: Material, sprite: boolean, width: number) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uStarCenter = center
      shader.uniforms.uStarRadius = radius
      shader.vertexShader = `varying vec3 vStarView;\n${shader.vertexShader}`
        .replace(sprite ? 'gl_Position = projectionMatrix * mvPosition;' : '#include <project_vertex>',
          `${sprite ? 'gl_Position = projectionMatrix * mvPosition;' : '#include <project_vertex>'}\nvStarView = mvPosition.xyz;`)
      shader.fragmentShader = `uniform vec3 uStarCenter; uniform float uStarRadius; varying vec3 vStarView;\n${shader.fragmentShader}`
        // 特写采用距球体轮廓的柔光衰减，原贴图按球心衰减会让日面边缘失去柔光。
        .replace('#include <map_fragment>', `
          vec3 ray = normalize(vStarView);
          float edge = length(cross(uStarCenter, ray)) / uStarRadius - 1.0;
          float aa = max(fwidth(edge), 0.0002);
          if (dot(uStarCenter, ray) <= 0.0 || edge < -aa) discard;
          diffuseColor.a *= smoothstep(-aa, aa, edge) * exp(-max(edge, 0.0) / ${width.toFixed(3)});`)
    }
    material.customProgramCacheKey = () => `stellar-closeup-edge-${sprite}-${width}-v1`
    material.needsUpdate = true
  }
  edgeGlow(asset.glow.material, false, 0.045)
  edgeGlow(asset.nearHalo.material, true, 0.075)
  edgeGlow(asset.farHalo.material, true, 0.20)
  asset.nearHalo.material.color.set('#ffd19a')
  asset.farHalo.material.color.set('#c0c8dc')
  for (const object of [asset.glow, asset.nearHalo, asset.farHalo]) object.onBeforeRender = updateUniforms

  return {
    update(time: number) {
      asset.updateGlow(time * STELLAR_CLOSEUP.frequencyScale, 1)
      const pulse = asset.glow.scale.x
      asset.glow.material.opacity = STELLAR_CLOSEUP.innerOpacity * pulse
      asset.nearHalo.material.opacity = STELLAR_CLOSEUP.nearOpacity * pulse
      asset.farHalo.material.opacity = STELLAR_CLOSEUP.farOpacity * pulse
    },
  }
}
