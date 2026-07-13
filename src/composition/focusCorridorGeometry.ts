import type { ScreenCircle, TangentLine } from '../types'

const STAR_RING_PADDING = 10
const PLANET_RING_PADDING = 8

export interface HudTangentGeometry {
  starA: { x: number; y: number }
  starB: { x: number; y: number }
  planetA: { x: number; y: number }
  planetB: { x: number; y: number }
  starIndexA?: number
  starIndexB?: number
  planetIndexA?: number
  planetIndexB?: number
  angleA?: number
  angleB?: number
  lines: TangentLine[]
}

export function screenRx(circle: ScreenCircle): number {
  return circle.rx ?? circle.r
}

export function screenRy(circle: ScreenCircle): number {
  return circle.ry ?? circle.r
}

export function computeHudTangentGeometry(
  star: ScreenCircle,
  planet: ScreenCircle,
  width: number,
  height: number,
): HudTangentGeometry | null {
  if (star.contour && planet.contour) {
    return computeContourTangentGeometry(star, planet, width, height)
  }

  const starRX = screenRx(star) + STAR_RING_PADDING
  const starRY = screenRy(star) + STAR_RING_PADDING
  const planetRX = screenRx(planet) + PLANET_RING_PADDING
  const planetRY = screenRy(planet) + PLANET_RING_PADDING
  const dx = planet.x - star.x
  const dy = planet.y - star.y
  const dist = Math.hypot(dx, dy)
  if (dist <= Math.abs(starRX - planetRX) + 1 || !Number.isFinite(dist)) return null

  const theta = Math.atan2(dy, dx)
  const phi = Math.asin(Math.max(-1, Math.min(1, (starRX - planetRX) / dist)))
  const angleA = theta + Math.PI / 2 - phi
  const angleB = theta - Math.PI / 2 + phi
  const extLen = Math.hypot(width, height) + dist + starRX + planetRX

  const starA = { x: star.x + starRX * Math.cos(angleA), y: star.y + starRY * Math.sin(angleA) }
  const starB = { x: star.x + starRX * Math.cos(angleB), y: star.y + starRY * Math.sin(angleB) }
  const planetA = { x: planet.x + planetRX * Math.cos(angleA), y: planet.y + planetRY * Math.sin(angleA) }
  const planetB = { x: planet.x + planetRX * Math.cos(angleB), y: planet.y + planetRY * Math.sin(angleB) }

  const makeLine = (from: typeof starA, to: typeof planetA): TangentLine => {
    const tx = to.x - from.x
    const ty = to.y - from.y
    const len = Math.hypot(tx, ty) || 1
    return {
      x1: from.x - (tx / len) * extLen,
      y1: from.y - (ty / len) * extLen,
      x2: to.x + (tx / len) * extLen,
      y2: to.y + (ty / len) * extLen,
    }
  }

  return {
    starA,
    starB,
    planetA,
    planetB,
    angleA,
    angleB,
    lines: [makeLine(starA, planetA), makeLine(starB, planetB)],
  }
}

function computeContourTangentGeometry(
  star: ScreenCircle,
  planet: ScreenCircle,
  width: number,
  height: number,
): HudTangentGeometry | null {
  const starContour = star.contour
  const planetContour = planet.contour
  if (!starContour || !planetContour || starContour.length < 3 || planetContour.length < 3) return null

  const dx = planet.x - star.x
  const dy = planet.y - star.y
  const dist = Math.hypot(dx, dy)
  const starRX = Math.max(screenRx(star), screenRy(star))
  const planetRX = Math.max(screenRx(planet), screenRy(planet))
  if (dist <= Math.abs(starRX - planetRX) + 1 || !Number.isFinite(dist)) return null

  const theta = Math.atan2(dy, dx)
  const phi = Math.asin(Math.max(-1, Math.min(1, (starRX - planetRX) / dist)))
  const angleA = theta + Math.PI / 2 - phi
  const angleB = theta - Math.PI / 2 + phi

  const supportAtAngle = (
    contour: NonNullable<ScreenCircle['contour']>,
    center: { x: number; y: number },
    angle: number,
  ) => {
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    let bestIndex = 0
    let bestScore = (contour[0].x - center.x) * nx + (contour[0].y - center.y) * ny
    for (let idx = 1; idx < contour.length; idx++) {
      const score = (contour[idx].x - center.x) * nx + (contour[idx].y - center.y) * ny
      if (score > bestScore) {
        bestScore = score
        bestIndex = idx
      }
    }
    return { index: bestIndex, point: contour[bestIndex] }
  }

  const starA = supportAtAngle(starContour, star, angleA)
  const starB = supportAtAngle(starContour, star, angleB)
  const planetA = supportAtAngle(planetContour, planet, angleA)
  const planetB = supportAtAngle(planetContour, planet, angleB)
  const extLen = Math.hypot(width, height) + dist

  const makeLine = (from: { x: number; y: number }, to: { x: number; y: number }): TangentLine => {
    const tx = to.x - from.x
    const ty = to.y - from.y
    const len = Math.hypot(tx, ty) || 1
    return {
      x1: from.x - (tx / len) * extLen,
      y1: from.y - (ty / len) * extLen,
      x2: to.x + (tx / len) * extLen,
      y2: to.y + (ty / len) * extLen,
    }
  }

  return {
    starA: starA.point,
    starB: starB.point,
    planetA: planetA.point,
    planetB: planetB.point,
    starIndexA: starA.index,
    starIndexB: starB.index,
    planetIndexA: planetA.index,
    planetIndexB: planetB.index,
    angleA,
    angleB,
    lines: [makeLine(starA.point, planetA.point), makeLine(starB.point, planetB.point)],
  }
}

export function contourArc(
  contour: NonNullable<ScreenCircle['contour']>,
  startIndex: number,
  endIndex: number,
  reference: { x: number; y: number },
): NonNullable<ScreenCircle['contour']> {
  const walk = (forward: boolean) => {
    const points = []
    let idx = startIndex
    for (let guard = 0; guard <= contour.length; guard++) {
      points.push(contour[idx])
      if (idx === endIndex) break
      idx = forward
        ? (idx + 1) % contour.length
        : (idx - 1 + contour.length) % contour.length
    }
    return points
  }
  const a = walk(true)
  const b = walk(false)
  const score = (points: NonNullable<ScreenCircle['contour']>) =>
    points.reduce((sum, point) => sum + Math.hypot(point.x - reference.x, point.y - reference.y), 0) / points.length
  return score(a) >= score(b) ? a : b
}
