import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

// ============================================================
// Slot 动画配置
// ============================================================

export interface SlotAnimationConfig {
  /** 行内动画策略 */
  inline: 'literal' | 'directly'
  /** 逐字间隔 ms（inline: literal 时） */
  charInterval?: number
  /** 逐字开始前延迟 ms */
  startDelay?: number

  /** 行间动画策略（多行容器） */
  rows?: 'lineByLine' | 'directly'
  /** 逐行动画的步进间�?ms（rows: lineByLine 时） */
  rowInterval?: number

  /** 溢出策略 */
  overflow: 'static' | 'rolling'
  /** 滚动间隔 ms（overflow: rolling 时） */
  rollingInterval?: number

  /** 内容轮询间隔 ms（定时调�?getLines/getLine 刷新）。默�?250ms */
  pollInterval?: number
}

export const DEFAULT_ANIMATION: SlotAnimationConfig = {
  inline: 'directly',
  overflow: 'static',
}

// ============================================================
// Slot 类型
// ============================================================

export interface SlotBase {
  name: string
  /** 统一格式 "type:name"，如 "welcome:greeting" */
  appearAfter?: string
  /** �?slot �?echo area 中占用的行数，默�?1 */
  lineCount?: number
  /** 动画配置 */
  animation?: SlotAnimationConfig
}

export interface WelcomeSlot extends SlotBase {
  type: 'welcome'
  text: string
  /** 完成后等�?ms */
  exitGap?: number
  children?: never
}

export interface SectionSlot extends SlotBase {
  type: 'section'
  getLines: () => string[]
  children?: never
}

export interface ContentLineSlot extends SlotBase {
  type: 'contentLine'
  getLine: () => string
  children?: never
}

export type TerminalSlot = WelcomeSlot | SectionSlot | ContentLineSlot

// ============================================================
// SlotContext �?校验 Slot 组件�?TerminalBar 内部使用
// ============================================================

const SlotContext = createContext(false)

export function useSlotContext() {
  return useContext(SlotContext)
}

// ============================================================
// Slot 组件（仅捕获 props，零 DOM�?
// ============================================================

function createSlotComponent(displayType: string) {
  const SlotComponent = (_props: Record<string, unknown>) => {
    if (!useContext(SlotContext)) {
      console.warn(`TerminalBar.${displayType} must be rendered inside <TerminalBar>. It is currently outside and will be ignored.`)
    }
    return null
  }
  SlotComponent.displayName = `TerminalBar.${displayType}`
  return SlotComponent
}

export const Slot = {
  Welcome: createSlotComponent('Welcome'),
  Section: createSlotComponent('Section'),
  ContentLine: createSlotComponent('ContentLine'),
  collectSlots,
  /** SlotContext Provider �?TerminalBar 内部使用 */
  Provider: SlotContext.Provider,
}

// ============================================================
// �?children 中同步提�?Slot 配置
//
// 使用 element.type 引用比较替代 displayName 字符串匹配，
// 生产构建（minify）安全�?
// ============================================================

export function collectSlots(children: ReactNode): TerminalSlot[] {
  const slots: TerminalSlot[] = []
  const arr = Array.isArray(children) ? children : [children]
  for (const child of arr) {
    if (!child || typeof child !== 'object' || !('type' in child) || !('props' in child)) continue
    const el = child as { type: unknown; props: Record<string, unknown> }
    const props = el.props
    if (!props.name) continue

    const anim = (props.animation ?? DEFAULT_ANIMATION) as SlotAnimationConfig
    const lineCount = (props.lineCount ?? 1) as number
    const appearAfter = props.appearAfter as string | undefined

    if (el.type === Slot.Welcome) {
      slots.push({
        type: 'welcome', name: props.name as string,
        text: (props.text ?? '') as string,
        lineCount, animation: anim,
        exitGap: props.exitGap as number | undefined,
        appearAfter,
      })
    } else if (el.type === Slot.Section) {
      slots.push({
        type: 'section', name: props.name as string,
        getLines: props.getLines as () => string[],
        lineCount, animation: anim, appearAfter,
      })
    } else if (el.type === Slot.ContentLine) {
      slots.push({
        type: 'contentLine', name: props.name as string,
        getLine: props.getLine as () => string,
        lineCount, animation: anim, appearAfter,
      })
    }
  }
  return slots
}
