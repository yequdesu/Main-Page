/**
 * PlanetLabelDebug �?PBD 布局调试覆盖层（独立组件）�?
 *
 * 通过主终�?`debug` 命令切换显示/隐藏�?
 * 使用 `window.__DEBUG__` 全局标志位控制，与主终端 debug 命令一致�?
 *
 * 可视化元�?
 *   青色�?    = planet 视觉边缘
 *   白色虚线�?= 约束 B 行星遮挡避免�?(planetScreenRadius + 4px)
 *   灰白虚线�?= 近距离排斥区 (planetScreenRadius + 10px)
 *   红色虚线�?= anchor-range (planetScreenRadius + gap + anchorRangeRadius)
 *   绿色矩形   = 算法 label 矩形
 *   红色圆点   = 左右锚点
 *   白色虚线�?= 中央恒星内层光晕（不与行星关联）
 */

import { useScrollStore } from '../stores/scrollStore'
import { getDomLayer, resolvePointerEvents } from '../composition/layerRegistry'
import type { ScreenCircle, ScreenPoint } from '../composition/coreAnchors'
import type { LabelState } from '../behaviors/useFloatingLabels'
import type { PBDParams } from '../behaviors/usePBDLayout'
import { PLANET_AVOID_MARGIN } from '../behaviors/usePBDLayout'

interface Props {
  labels: LabelState[]
  screenCoords: [ScreenPoint, ScreenPoint, ScreenPoint]
  screenRadii: [number, number, number]
  centralStar: ScreenCircle
  collapsedWidth: number
  expandedWidth: number
  collapsedHeight: number
  expandedHeight: number
  pbdParams?: PBDParams
  collapsedFitWidths?: Record<number, number>
}

export default function PlanetLabelDebug({
  labels, screenCoords, screenRadii, centralStar,
  collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, pbdParams, collapsedFitWidths,
}: Props) {
  const enabled = useScrollStore(s => s.debugMode)
  const layer = getDomLayer('svg.planetLabelDebug')

  if (!enabled) return null

  const _gap = pbdParams?.gap ?? 6
  const _range = pbdParams?.anchorRangeRadius ?? 90

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
      {/* 中央恒星 */}
      {centralStar.visible && (
        <circle cx={centralStar.x} cy={centralStar.y} r={centralStar.r}
          fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="6 3" opacity={0.7} />
      )}

      {/* 各行�?*/}
      {screenCoords.map((sc, i) => {
        if (!sc.visible) return null
        const pr = screenRadii[i]
        const label = labels[i]
        const collapsed = label?.collapsed !== false
        const fitW = collapsedFitWidths?.[i]
        const w = collapsed ? (fitW ?? collapsedWidth) : expandedWidth
        const h = collapsed ? collapsedHeight : expandedHeight

        return (
          <g key={`pld-${i}`}>
            {/* planet 视觉边缘 */}
            <circle cx={sc.x} cy={sc.y} r={pr} fill="none" stroke="cyan" strokeWidth="1" opacity={0.5} />
            {/* 约束 B: 行星遮挡避免区（planetScreenRadius + PLANET_AVOID_MARGIN�?*/}
            <circle cx={sc.x} cy={sc.y} r={pr + PLANET_AVOID_MARGIN}
              fill="none" stroke="white" strokeWidth="0.7" strokeDasharray="1 3" opacity={0.6} />
            {/* 近距离排斥区 */}
            <circle cx={sc.x} cy={sc.y} r={pr + 10}
              fill="none" stroke="#ccc" strokeWidth="1" strokeDasharray="3 3" opacity={0.5} />
            {/* anchor-range */}
            <circle cx={sc.x} cy={sc.y} r={pr + _gap + _range}
              fill="none" stroke="red" strokeWidth="1" strokeDasharray="4 4" opacity={0.5} />

            {label?.debugAnchors && (
              <>
                {/* label 矩形 */}
                <rect x={label.x} y={label.y} width={w} height={h}
                  fill="none" stroke="lime" strokeWidth="1" opacity={0.7} />
                {/* 锚点 */}
                <circle cx={label.debugAnchors.anchorL.x} cy={label.debugAnchors.anchorL.y}
                  r={3} fill="red" opacity={0.8} />
                <circle cx={label.debugAnchors.anchorR.x} cy={label.debugAnchors.anchorR.y}
                  r={3} fill="red" opacity={0.8} />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
