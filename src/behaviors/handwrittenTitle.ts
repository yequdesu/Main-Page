import { bellDistanceProgress, smootherstep, type MotionPoint } from './motionTrail'

export interface RasterCell {
  x: number
  y: number
}

export interface DfsWalkStep extends RasterCell {
  breakBefore: boolean
}

export interface GlyphDfsPlan {
  cellsByVisit: Array<{ cell: RasterCell; visitStep: number }>
  walk: DfsWalkStep[]
}

export interface GlyphDfsFrame {
  visibleCellCount: number
  trail: Array<{ point: MotionPoint; radius: number }>
  main: { point: MotionPoint; radius: number } | null
}

const NEIGHBORS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const

function key(x: number, y: number): string {
  return `${x},${y}`
}

function chooseFirstSource(cells: readonly RasterCell[]): number {
  let best = 0
  for (let index = 1; index < cells.length; index += 1) {
    const cell = cells[index]
    const current = cells[best]
    if (cell.x < current.x || (cell.x === current.x && cell.y < current.y)) best = index
  }
  return best
}

function chooseNearestUnvisited(
  cells: readonly RasterCell[],
  visited: Uint8Array,
  origin: RasterCell,
): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < cells.length; index += 1) {
    if (visited[index]) continue
    const dx = cells[index].x - origin.x
    const dy = cells[index].y - origin.y
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

/**
 * Builds one deterministic depth-first walk for a rasterized glyph. Separate
 * components (for example the macron above Ē) resume from the nearest cell and
 * are marked as a pen lift, so rendering never draws an artificial bridge.
 */
export function buildGlyphDfsPlan(inputCells: readonly RasterCell[]): GlyphDfsPlan {
  const cells: RasterCell[] = []
  const indexByPosition = new Map<string, number>()
  for (const cell of inputCells) {
    const x = Math.round(cell.x)
    const y = Math.round(cell.y)
    const positionKey = key(x, y)
    if (indexByPosition.has(positionKey)) continue
    indexByPosition.set(positionKey, cells.length)
    cells.push({ x, y })
  }
  if (cells.length === 0) return { cellsByVisit: [], walk: [] }

  const visited = new Uint8Array(cells.length)
  const visitStep = new Int32Array(cells.length)
  visitStep.fill(-1)
  const walk: DfsWalkStep[] = []
  let visitedCount = 0
  let source = chooseFirstSource(cells)

  while (visitedCount < cells.length) {
    if (visited[source]) {
      source = chooseNearestUnvisited(cells, visited, cells[source])
      if (source < 0) break
    }

    const stack: Array<{ cellIndex: number; nextNeighbor: number }> = [{
      cellIndex: source,
      nextNeighbor: 0,
    }]
    visited[source] = 1
    visitStep[source] = walk.length
    visitedCount += 1
    walk.push({ ...cells[source], breakBefore: walk.length > 0 })

    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const cell = cells[top.cellIndex]
      let nextIndex = -1
      while (top.nextNeighbor < NEIGHBORS.length) {
        const [dx, dy] = NEIGHBORS[top.nextNeighbor]
        top.nextNeighbor += 1
        const candidate = indexByPosition.get(key(cell.x + dx, cell.y + dy))
        if (candidate !== undefined && !visited[candidate]) {
          nextIndex = candidate
          break
        }
      }

      if (nextIndex >= 0) {
        visited[nextIndex] = 1
        visitStep[nextIndex] = walk.length
        visitedCount += 1
        stack.push({ cellIndex: nextIndex, nextNeighbor: 0 })
        walk.push({ ...cells[nextIndex], breakBefore: false })
        continue
      }

      stack.pop()
      if (stack.length > 0) {
        const parent = cells[stack[stack.length - 1].cellIndex]
        walk.push({ ...parent, breakBefore: false })
      }
    }

    if (visitedCount < cells.length) {
      source = chooseNearestUnvisited(cells, visited, walk[walk.length - 1])
    }
  }

  const cellsByVisit = cells
    .map((cell, index) => ({ cell, visitStep: visitStep[index] }))
    .sort((a, b) => a.visitStep - b.visitStep)
  return { cellsByVisit, walk }
}

export function getGlyphDfsFrame(
  plan: GlyphDfsPlan,
  writeProgress: number,
  cellSize: number,
  tailSteps = 20,
): GlyphDfsFrame {
  if (plan.walk.length === 0) {
    return { visibleCellCount: 0, trail: [], main: null }
  }

  const progress = Math.max(0, Math.min(1, writeProgress))
  const traversedSteps = Math.min(
    plan.walk.length,
    Math.floor(bellDistanceProgress(progress) * plan.walk.length),
  )
  let visibleCellCount = 0
  while (
    visibleCellCount < plan.cellsByVisit.length &&
    plan.cellsByVisit[visibleCellCount].visitStep < traversedSteps
  ) {
    visibleCellCount += 1
  }

  if (traversedSteps === 0 || progress >= 1) {
    return { visibleCellCount, trail: [], main: null }
  }

  const currentIndex = traversedSteps - 1
  let segmentStart = currentIndex
  const minimumIndex = Math.max(0, currentIndex - Math.max(1, tailSteps) + 1)
  while (segmentStart > minimumIndex && !plan.walk[segmentStart].breakBefore) {
    segmentStart -= 1
  }

  const startScale = smootherstep(Math.min(1, progress / 0.06))
  const finishScale = 1 - smootherstep(Math.max(0, (progress - 0.94) / 0.06))
  const brushRadius = Math.max(0.5, cellSize * 1.35) * startScale * finishScale
  const activeSteps = plan.walk.slice(segmentStart, currentIndex + 1)
  const trail = activeSteps.slice(0, -1).map((step, index) => {
    const along = (index + 1) / Math.max(1, activeSteps.length)
    return {
      point: {
        x: (step.x + 0.5) * cellSize,
        y: (step.y + 0.5) * cellSize,
      },
      radius: brushRadius * (0.18 + 0.72 * smootherstep(along)),
    }
  })
  const current = activeSteps[activeSteps.length - 1]
  return {
    visibleCellCount,
    trail,
    main: {
      point: {
        x: (current.x + 0.5) * cellSize,
        y: (current.y + 0.5) * cellSize,
      },
      radius: brushRadius,
    },
  }
}
