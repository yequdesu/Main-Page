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

export interface FocusRingGeometry {
  radius: number
  ringWidth: number
  outerRingWidth: number
  outerRingRadius: number
  secondRadiantLength: number
  outermostRadiantRadius: number
  thirdRingRadius: number
  thirdRingWidth: number
  fourthRingRadius: number
  fifthRingRadius: number
  sixthRingRadius: number
}

export interface FocusInversionCircleGeometry {
  x: number
  y: number
  radius: number
}

export const FOCUS_LAYER_STAGGER_SECONDS = 0.2
export const FOCUS_LAYER_COUNT = 6
export const FOCUS_EFFECT_DURATION = 1.9
export const FOCUS_EFFECT_EXIT_DURATION = 1.7
export const FOCUS_LAYER_EXIT_DURATION = 0.7
export const FOCUS_MIN_EXIT_DURATION = 0.24

/** Reciprocal response: fast initial expansion, then a long eased tail. */
export function inverseProportionalEase(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  const strength = 8
  const end = 1 - 1 / (1 + strength)
  return (1 - 1 / (1 + strength * t)) / end
}

export function focusLayerRawProgress(focusAge: number, layerOrder: number): number {
  const order = Math.max(0, Math.min(FOCUS_LAYER_COUNT - 1, layerOrder))
  const delay = order * FOCUS_LAYER_STAGGER_SECONDS
  const duration = Math.max(0.2, FOCUS_EFFECT_DURATION - delay)
  return Math.max(0, Math.min(1, (focusAge - delay) / duration))
}

export function focusLayerProgress(focusAge: number, layerOrder: number): number {
  return inverseProportionalEase(focusLayerRawProgress(focusAge, layerOrder))
}

export function focusExitDuration(focusAge: number): number {
  return Math.max(
    FOCUS_MIN_EXIT_DURATION,
    Math.min(FOCUS_EFFECT_EXIT_DURATION, Math.max(0, focusAge)),
  )
}

export function reverseFocusLayerProgress(
  startProgress: number,
  exitProgress: number,
  layerOrder: number,
  exitDuration = FOCUS_EFFECT_EXIT_DURATION,
): number {
  const order = Math.max(0, Math.min(FOCUS_LAYER_COUNT - 1, layerOrder))
  const durationScale = Math.max(0.14, Math.min(1, exitDuration / FOCUS_EFFECT_EXIT_DURATION))
  const outerFirstDelay = (FOCUS_LAYER_COUNT - 1 - order) * FOCUS_LAYER_STAGGER_SECONDS * durationScale
  const layerExitDuration = FOCUS_LAYER_EXIT_DURATION * durationScale
  const elapsed = Math.max(0, exitProgress) * exitDuration
  const localProgress = Math.max(0, Math.min(1, (elapsed - outerFirstDelay) / layerExitDuration))
  return Math.max(0, Math.min(1, startProgress)) * inverseProportionalEase(1 - localProgress)
}

export const FOCUS_INVERSION_CIRCLE_SPECS = [
  { ring: 'ring2' as const, baseAngle: -Math.PI * 0.22, speed: 0.030, sizeFactor: 0.18 },
  { ring: 'ring4' as const, baseAngle: Math.PI * 0.28, speed: 0.020, sizeFactor: 0.28 },
  { ring: 'ring6' as const, baseAngle: Math.PI * 1.12, speed: 0.012, sizeFactor: 0.40 },
]

/** Shared screen-space radii for the paired focus rings and radiant geometry. */
export function computeFocusRingGeometry(
  star: ScreenCircle,
  width: number,
  height: number,
): FocusRingGeometry {
  const radius = Math.max(screenRx(star), screenRy(star)) + 24
  const ringWidth = Math.max(4.4, Math.min(8.8, radius * 0.056))
  const outerRingWidth = Math.max(0.7, Math.min(1.3, radius * 0.008))
  const nominalOuterRingRadius = radius + 24
  const nominalRingGap = nominalOuterRingRadius - radius - (ringWidth + outerRingWidth) * 0.5
  const ringGap = nominalRingGap * 0.5
  const outerRingRadius = nominalOuterRingRadius - (nominalRingGap - ringGap)
  const secondRadiantLength = Math.max(48, Math.min(width, height) * 0.14)
  const outermostRadiantRadius = radius + 70 + secondRadiantLength + 5
  const thirdRingRadius = outermostRadiantRadius + 12
  const thirdRingWidth = ringWidth * 2
  const fourthRingRadius = thirdRingRadius + (thirdRingWidth + outerRingWidth) * 0.5 + ringGap
  const pairSpacing = fourthRingRadius - thirdRingRadius
  const groupSpacing = thirdRingRadius - outerRingRadius
  const fifthRingRadius = fourthRingRadius + groupSpacing
  const sixthRingRadius = fifthRingRadius + pairSpacing

  return {
    radius,
    ringWidth,
    outerRingWidth,
    outerRingRadius,
    secondRadiantLength,
    outermostRadiantRadius,
    thirdRingRadius,
    thirdRingWidth,
    fourthRingRadius,
    fifthRingRadius,
    sixthRingRadius,
  }
}

export function computeFocusInversionCircleGeometry(
  star: ScreenCircle,
  width: number,
  height: number,
  focusAge: number,
  progress: number | number[] = 1,
): FocusInversionCircleGeometry[] {
  const ringGeometry = computeFocusRingGeometry(star, width, height)
  const ringRadii = [
    ringGeometry.outerRingRadius,
    ringGeometry.fourthRingRadius,
    ringGeometry.sixthRingRadius,
  ]
  const age = Math.max(0, focusAge)

  return FOCUS_INVERSION_CIRCLE_SPECS.map((spec, index) => {
    const targetAngle = spec.baseAngle - age * spec.speed
    const ringRadius = ringRadii[index]
    const radialProgress = Array.isArray(progress) ? progress[index] ?? 0 : inverseProportionalEase(progress)
    // The circle does not travel on a straight radial line. It leads into its
    // final position on a short counter-clockwise arc, then settles on the
    // ring. Reversing radialProgress retraces the same path.
    const orbitLead = (1 - radialProgress) * 0.38
    const angle = targetAngle - orbitLead
    return {
      x: star.x + Math.cos(angle) * ringRadius * radialProgress,
      y: star.y + Math.sin(angle) * ringRadius * radialProgress,
      radius: Math.max(20, Math.min(116, star.r * spec.sizeFactor * 2)),
    }
  })
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
