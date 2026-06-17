import { create } from 'zustand'

// ============================================================
// RealtimeStore — 3D 场景运行时数据的 pub/sub 枢纽
//
// 行星坐标、轨道参数、摄像机状态、debris 计数等实时数据。
// TerminalBar contentLines / buildStatusLines 通过 selector 读取。
// ============================================================

export interface PlanetCoords {
  x: number
  y: number
  z: number
}

export interface CameraData {
  pos: { x: number; y: number; z: number }
  /** 朝向（forward 向量） */
  look: { x: number; y: number; z: number }
  fov: number
}

interface RealtimeSlice {
  planetCoords: [PlanetCoords, PlanetCoords, PlanetCoords]
  planetAngles: [number, number, number]
  planetSpeeds: [number, number, number]

  /** 外层轨道（gyro rings）的进动角速度（rad/s）和当前旋转角 */
  orbitSpeeds: [number, number, number]
  orbitAngles: [number, number, number]

  /** 摄像机运行时数据 */
  camera: CameraData
  /** dust field 中的 mesh 实例总数量 */
  debrisCount: number
}

interface RealtimeActions {
  setPlanetData: (
    coords: [PlanetCoords, PlanetCoords, PlanetCoords],
    angles: [number, number, number],
    speeds: [number, number, number],
    orbitSpeeds: [number, number, number],
    orbitAngles: [number, number, number],
  ) => void
  setCameraData: (camera: CameraData) => void
  setDebrisCount: (count: number) => void
}

export type RealtimeStore = RealtimeSlice & RealtimeActions

export const useRealtimeStore = create<RealtimeStore>()((set) => ({
  planetCoords: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ],
  planetAngles: [0, 0, 0],
  planetSpeeds: [0, 0, 0],
  orbitSpeeds: [0.02, 0.04, 0.06],
  orbitAngles: [0, 0, 0],
  camera: { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, fov: 50 },
  debrisCount: 0,

  setPlanetData: (coords, angles, speeds, orbitSpeeds, orbitAngles) =>
    set({ planetCoords: coords, planetAngles: angles, planetSpeeds: speeds, orbitSpeeds, orbitAngles }),
  setCameraData: (camera) => set({ camera }),
  setDebrisCount: (count) => set({ debrisCount: count }),
}))
