import { useOptionalCameraMotion } from './CameraMotionContext'
import { createStellarTransitionState } from '../behaviors/stellarTransition'

// 未挂载场景的资产预览保持 Act 3；运行时统一读取运镜协调器的通道。
const idle = createStellarTransitionState()
export { CameraMotionProvider as StellarTransitionProvider } from './CameraMotionContext'
export const useStellarTransition = () => useOptionalCameraMotion()?.stellar ?? idle
