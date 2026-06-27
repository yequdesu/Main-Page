/**
 * PlanetLabelGuideLines �?label �?planet 引导虚线�?
 *
 * 独立组件，不嵌入布局系统主代码�?
 * 距离�?label 左右锚点中距 planet 质心最近者，连线即该最短线段�?
 * 蒙版厚度 3px，收缩动画完成后绘制�?
 */

import { useScrollStore } from '../stores/scrollStore'
import { themeColor } from '../theme/colors'
import { getDomLayer, resolvePointerEvents } from '../composition/layerRegistry'
import type { ScreenPoint } from '../composition/coreAnchors'
import type { LabelState } from '../behaviors/useFloatingLabels'

interface Props {
  labels: LabelState[]
  screenCoords: [ScreenPoint, ScreenPoint, ScreenPoint]
  screenRadii: [number, number, number]
  collapsedWidth: number
  expandedWidth: number
  collapsedHeight: number
  expandedHeight: number
  activeTrackIdx: number
  guideLayouts?: Record<number, { width?: number; ready: boolean }>
}

/** 锚点�?planet 圆边的距离阈值（px�?*/
const DISTANCE_THRESHOLD = 11
const EPSILON = 0.001
/** 蒙版厚度（px�?*/
const MASK = 3

export default function PlanetLabelGuideLines({
  labels, screenCoords, screenRadii, collapsedWidth, expandedWidth, collapsedHeight, expandedHeight,
  activeTrackIdx, guideLayouts,
}: Props) {
  const dayNight = useScrollStore(s => s.dayNight)
  const guideStroke = themeColor('guideLine', dayNight)
  const layer = getDomLayer('svg.planetLabelGuides')

  return (
    <svg
      style={{
        position: layer.position,
        inset: 0,
        zIndex: layer.zIndex,
        pointerEvents: resolvePointerEvents(layer.pointerEvents),
      }}
      width="100%" height="100%"
    >
      {labels.map((label) => {
        const sc = screenCoords[label.trackIdx]
        const pr = screenRadii[label.trackIdx]
        const guideLayout = guideLayouts?.[label.trackIdx]
        if (!sc.visible || !label.visible) return null
        if (!guideLayout?.ready) return null
        if (activeTrackIdx === label.trackIdx) return null

        const anchors = label.debugAnchors
        if (!anchors) return null

        const fitW = guideLayout.width
        const w = fitW ?? collapsedWidth

        // 四个计算点：左右锚点 + top-left / top-right �?
        const tl = { x: label.x, y: label.y }
        const tr = { x: label.x + w, y: label.y }
        const points = [
          { x: anchors.anchorL.x, y: anchors.anchorL.y },
          { x: anchors.anchorR.x, y: anchors.anchorR.y },
          tl,
          tr,
        ]

        // 取距�?planet 质心最近�?
        let best = points[0]
        let bestDist = Math.hypot(best.x - sc.x, best.y - sc.y)
        for (let i = 1; i < points.length; i++) {
          const d = Math.hypot(points[i].x - sc.x, points[i].y - sc.y)
          if (d < bestDist) { best = points[i]; bestDist = d }
        }

        if (bestDist < EPSILON) return null

        // 间隙 = 最近点到质心距�?- planet 半径
        const gap = bestDist - pr
        if (gap <= DISTANCE_THRESHOLD) return null

        // 方向单位向量（从最近点指向 planet 质心�?
        const nx = (sc.x - best.x) / bestDist
        const ny = (sc.y - best.y) / bestDist

        // MASK 蒙版裁剪�?px）：
        // 起点：最近点�?planet 方向偏移 MASK px（离开 label 边界�?
        const x1 = best.x + nx * MASK
        const y1 = best.y + ny * MASK
        // 终点：planet 质心向最近点方向偏移 (radius + MASK) px（离开 planet 表面�?
        const x2 = sc.x - nx * (pr + MASK)
        const y2 = sc.y - ny * (pr + MASK)

        return (
          <line key={`guide-${label.trackIdx}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={guideStroke}
            strokeWidth={0.7}
            strokeDasharray="2 1"
          />
        )
      })}
    </svg>
  )
}
