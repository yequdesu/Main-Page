import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createFocusChannels } from '../behaviors/useFocusTimeline'
import { createStellarTransitionState } from '../behaviors/stellarTransition'
import { createCameraMotionCoordinator } from '../behaviors/cameraMotionCoordinator'

function createMotion() {
  const focus = createFocusChannels(), stellar = createStellarTransitionState()
  return { focus, stellar, coordinator: createCameraMotionCoordinator(focus, stellar) }
}
const CameraMotionContext = createContext<ReturnType<typeof createMotion> | null>(null)

export function CameraMotionProvider({ children }: { children: ReactNode }) {
  const motion = useMemo(createMotion, [])
  return <CameraMotionContext.Provider value={motion}>{children}</CameraMotionContext.Provider>
}
export const useOptionalCameraMotion = () => useContext(CameraMotionContext)
export function useCameraMotion() {
  const motion = useOptionalCameraMotion()
  if (!motion) throw new Error('CameraMotionProvider is required for scene camera animation')
  return motion
}
