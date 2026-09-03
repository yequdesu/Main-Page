export const SQUARE_WAVE_LIFETIME = 6
export const SQUARE_WAVE_FADE_GENERATIONS = 3
export const SQUARE_WAVE_FADE_START = SQUARE_WAVE_LIFETIME - SQUARE_WAVE_FADE_GENERATIONS
export const SQUARE_WAVE_SPACING = 1.1
export const SQUARE_WAVE_SEED_SCALE = 0.88

interface Direction {
  dx: number
  dy: number
}

const DIRECTIONS: readonly Direction[] = [
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
]

const SQUARE_WAVE_JITTER_RADIUS = 0.18

export interface SquareWaveCell {
  x: number
  y: number
  birthGeneration: number
  parentX: number
  parentY: number
}

export interface SquareWaveSprite {
  x: number
  y: number
  opacity: number
}

export interface SquareWaveContourSplit {
  solidSprites: SquareWaveSprite[]
  fadingCells: SquareWaveCell[]
}

function hashCell(x: number, y: number, generation = 0): number {
  let value = Math.imul(x ^ 0x6d2b79f5, 0x1b873593)
  value ^= Math.imul(y ^ 0x9e3779b9, 0x85ebca6b)
  value ^= Math.imul(generation ^ 0x27d4eb2d, 0xc2b2ae35)
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  return value >>> 0
}

function smootherstep(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function radialDistance(x: number, y: number): number {
  return Math.hypot(x, y)
}

function chooseInwardParent(x: number, y: number): Direction {
  const distance = radialDistance(x, y)
  const candidates = DIRECTIONS.filter((direction) =>
    radialDistance(x - direction.dx, y - direction.dy) < distance,
  )
  const offset = hashCell(x, y) % candidates.length
  return candidates[offset]
}

function createSquareWaveCell(x: number, y: number): SquareWaveCell {
  if (x === 0 && y === 0) {
    return { x, y, birthGeneration: 0, parentX: 0, parentY: 0 }
  }
  const distance = radialDistance(x, y)
  const jitter = ((hashCell(x, y, 1) % 1001) / 1000 - 0.5) *
    (SQUARE_WAVE_JITTER_RADIUS * 2)
  const parentDirection = chooseInwardParent(x, y)
  return {
    x,
    y,
    birthGeneration: Math.max(0.001, distance + jitter),
    parentX: x - parentDirection.dx,
    parentY: y - parentDirection.dy,
  }
}

export function buildSquareWavePlan(maxGeneration: number): SquareWaveCell[] {
  const radiusLimit = Math.max(0, maxGeneration)
  const gridRadius = Math.ceil(radiusLimit)
  const cells: SquareWaveCell[] = []

  for (let y = -gridRadius; y <= gridRadius; y++) {
    for (let x = -gridRadius; x <= gridRadius; x++) {
      const distance = radialDistance(x, y)
      if (distance > radiusLimit) continue
      cells.push(createSquareWaveCell(x, y))
    }
  }

  cells.sort((a, b) => a.birthGeneration - b.birthGeneration || a.y - b.y || a.x - b.x)
  return cells
}

/** Build only the live annulus around the current wave front. */
export function buildSquareWaveBand(generationProgress: number): SquareWaveCell[] {
  const outerRadius = Math.max(0, generationProgress + SQUARE_WAVE_JITTER_RADIUS)
  const innerRadius = Math.max(
    0,
    generationProgress - SQUARE_WAVE_LIFETIME - SQUARE_WAVE_JITTER_RADIUS,
  )
  const gridRadius = Math.ceil(outerRadius)
  const cells: SquareWaveCell[] = []

  const appendRange = (y: number, startX: number, endX: number) => {
    for (let x = startX; x <= endX; x++) {
      if (radialDistance(x, y) <= outerRadius) cells.push(createSquareWaveCell(x, y))
    }
  }

  for (let y = -gridRadius; y <= gridRadius; y++) {
    const outerSquared = outerRadius * outerRadius - y * y
    if (outerSquared < 0) continue
    const outerX = Math.floor(Math.sqrt(outerSquared))
    if (innerRadius <= 0 || Math.abs(y) >= innerRadius) {
      appendRange(y, -outerX, outerX)
      continue
    }
    const innerX = Math.ceil(Math.sqrt(Math.max(0, innerRadius * innerRadius - y * y)))
    appendRange(y, -outerX, -innerX)
    appendRange(y, innerX, outerX)
  }

  cells.sort((a, b) => a.birthGeneration - b.birthGeneration || a.y - b.y || a.x - b.x)
  return cells
}

export function getSquareWaveBandFrame(generationProgress: number): SquareWaveSprite[] {
  return getSquareWaveFrame(buildSquareWaveBand(generationProgress), generationProgress)
}

export function getSquareWaveFrame(
  plan: readonly SquareWaveCell[],
  generationProgress: number,
): SquareWaveSprite[] {
  const sprites: SquareWaveSprite[] = []

  for (const cell of plan) {
    const sprite = getSquareWaveCellSprite(cell, generationProgress)
    if (sprite) sprites.push(sprite)
  }

  return sprites
}

export function getSquareWaveCellSprite(
  cell: SquareWaveCell,
  generationProgress: number,
): SquareWaveSprite | undefined {
  const age = generationProgress - cell.birthGeneration
  if (age < 0 || age >= SQUARE_WAVE_LIFETIME) return undefined
  const movement = smootherstep(age)
  const fade = age <= SQUARE_WAVE_FADE_START
    ? 1
    : 1 - smootherstep((age - SQUARE_WAVE_FADE_START) / SQUARE_WAVE_FADE_GENERATIONS)
  return {
    x: cell.parentX + (cell.x - cell.parentX) * movement,
    y: cell.parentY + (cell.y - cell.parentY) * movement,
    opacity: fade,
  }
}

export function splitSquareWaveForContour(
  plan: readonly SquareWaveCell[],
  generationProgress: number,
): SquareWaveContourSplit {
  const solidSprites: SquareWaveSprite[] = []
  const fadingCells: SquareWaveCell[] = []

  for (const cell of plan) {
    const age = generationProgress - cell.birthGeneration
    if (age < 0 || age >= SQUARE_WAVE_LIFETIME) continue
    if (age >= SQUARE_WAVE_FADE_START) {
      fadingCells.push(cell)
      continue
    }
    const sprite = getSquareWaveCellSprite(cell, generationProgress)
    if (sprite) solidSprites.push(sprite)
  }

  return { solidSprites, fadingCells }
}

export function splitSquareWaveBandForContour(
  generationProgress: number,
): SquareWaveContourSplit {
  return splitSquareWaveForContour(buildSquareWaveBand(generationProgress), generationProgress)
}
