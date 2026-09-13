import { Box3, Vector3 } from 'three'
import { createCentralStarAsset } from '../actors/assets/centralStar'
import { createPlanetAsset, createPlanetHaloTexture, ATMOS_HALO_SCALE, PLANET_CONTENT_COLOR, PLANET_BASE_RADIUS } from '../actors/assets/planet'
import { createRingedPlanetAsset } from '../actors/assets/ringedPlanet'
import { createSatellitePlanetAsset, SATELLITE } from '../actors/assets/satellitePlanet'

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
  return createPlanetSample(createPlanetAsset, '行星')
}

export function createRingedPlanetPreview() {
  // 收窄该样本的远场光晕，使自动取景能看清环面，同时保留完整光晕。
  return createPlanetSample(createRingedPlanetAsset, '带环行星', 1.5 * ATMOS_HALO_SCALE)
}

export function createSatellitePlanetPreview() {
  // 用完整公转包络取景，不能只测量卫星初始位置。
  const motionExtent = PLANET_BASE_RADIUS * PREVIEW_SCALE * (SATELLITE.orbitRadius + SATELLITE.radius)
  return createPlanetSample(createSatellitePlanetAsset, '带卫星行星', 1.5 * ATMOS_HALO_SCALE, motionExtent)
}

function createPlanetSample(createAsset: typeof createPlanetAsset, name: string, haloScale = PREVIEW_HALO_SCALE, motionExtent = 0) {
  const texture = createPlanetHaloTexture()
  const asset = createAsset(0, texture)
  asset.root.name = name
  asset.core.scale.setScalar(PREVIEW_SCALE)
  asset.core.material.color.set(PLANET_CONTENT_COLOR)
  asset.core.material.opacity = 1
  // 包含光晕的最大呼吸幅度，暂停和播放时均保持相同的主体取景。
  const extent = Math.max(haloScale * 1.04 / 2, motionExtent)
  const bounds = new Box3(
    new Vector3(-extent, -extent, -extent), new Vector3(extent, extent, extent),
  )
  function update(time: number) {
    asset.updateAppearance(time, 0, PREVIEW_SCALE, 1, 1, haloScale)
  }
  update(0)
  // 派生资产的附加几何体也参与取景，随后保持边界固定，不随光晕呼吸缩放。
  asset.root.userData.studioBounds = bounds.union(new Box3().setFromObject(asset.root))
  return {
    root: asset.root, update,
    dispose() {
      asset.dispose()
      texture.dispose()
    },
  }
}
