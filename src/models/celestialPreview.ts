import { Box3, Vector3 } from 'three'
import { createCentralStarAsset } from '../actors/assets/centralStar'
import { createPlanetAsset, createPlanetHaloTexture, ATMOS_HALO_SCALE, PLANET_CONTENT_COLOR } from '../actors/assets/planet'

export function createStarPreview() {
  const asset = createCentralStarAsset()
  // 以核心和近场柔光取景，远场渐变继续渲染但不将核心挤成一个点。
  const extent = asset.nearHalo.scale.x / 2
  asset.root.userData.studioBounds = new Box3(
    new Vector3(-extent, -extent, -extent), new Vector3(extent, extent, extent),
  )
  asset.updateGlow(0, 1)
  return { root: asset.root, update: (time: number) => asset.updateGlow(time, 1), dispose: asset.dispose }
}

// 固定尺寸的单颗行星样本；形体和材质复用主页工厂，不读取随机值或相机距离。
const PREVIEW_SCALE = 20
const PREVIEW_HALO_SCALE = 2.4 * ATMOS_HALO_SCALE

export function createPlanetPreview() {
  const texture = createPlanetHaloTexture()
  const asset = createPlanetAsset(0, texture)
  asset.root.name = '行星'
  asset.core.scale.setScalar(PREVIEW_SCALE)
  asset.core.material.color.set(PLANET_CONTENT_COLOR)
  asset.core.material.opacity = 1
  // 包含光晕的最大呼吸幅度，暂停和播放时均保持相同的主体取景。
  const extent = PREVIEW_HALO_SCALE * 1.04 / 2
  asset.root.userData.studioBounds = new Box3(
    new Vector3(-extent, -extent, -extent), new Vector3(extent, extent, extent),
  )
  function update(time: number) {
    asset.updateAppearance(time, 0, PREVIEW_SCALE, 1, 1, PREVIEW_HALO_SCALE)
  }
  update(0)
  return {
    root: asset.root, update,
    dispose() {
      asset.dispose()
      texture.dispose()
    },
  }
}
