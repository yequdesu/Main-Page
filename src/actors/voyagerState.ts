import { Vector3, type Mesh } from 'three'

/** 场景实例发布的低频可用性与逐帧取景/命中数据，不进入 React 状态。 */
export const voyagerState = {
  available: false,
  opacity: 0,
  position: new Vector3(),
  radius: 0,
  hitRadius: 0,
  hitTargets: [] as Mesh[],
}
