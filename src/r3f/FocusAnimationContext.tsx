import { useCameraMotion } from './CameraMotionContext'
// 保留独立 Actor 测试的入口名；主场景只挂载一个 CameraMotionProvider。
export { CameraMotionProvider as FocusAnimationProvider } from './CameraMotionContext'
export const useFocusAnimation = () => useCameraMotion().focus
