import { useState, useEffect } from 'react'
import { useTypewriter } from './useTypewriter'
import type { WelcomeSlot } from './slots'

// ============================================================
// useTypewriterGate — typewriter 动画 + exitGap 等待
//
// 从 useSlotOrchestration 中提取的独立单元。
// typewriterDone 在 typewriter 完成后等待 exitGap 才置 true，
// 期间 cursor 保持渲染，所有下游 slot 的 GSAP 管线自然等待。
// ============================================================

interface TypewriterGateResult {
  /** typewriter 完成 + exitGap 结束后为 true — 解锁 GSAP timeline + polling */
  typewriterDone: boolean
  /** 原始 typewriter 完成状态（exitGap 之前）— 用于欢迎文本逐字回显 */
  twDone: boolean
  /** 当前 typewriter 阶段的显示文本（literal 逐字 / direct 全文） */
  typewriterDisplayed: string
  /** 供外部（TerminalBar）判断 typing→idle 过渡时机 */
  isTypewriterDone: boolean
}

export function useTypewriterGate(
  welcomeSlot: WelcomeSlot | undefined,
): TypewriterGateResult {
  const twCfg = welcomeSlot?.animation
  const useLiteral = twCfg?.inline === 'literal'
  const { displayedText, isDone: twDone } = useTypewriter({
    startDelay: useLiteral ? (twCfg?.startDelay ?? 800) : 0,
    charInterval: useLiteral ? (twCfg?.charInterval ?? 40) : 1,
    echoText: useLiteral ? (welcomeSlot?.text ?? '') : '',
  })

  const exitGap = welcomeSlot?.exitGap ?? 0
  const [typewriterDone, setTypewriterDone] = useState(false)
  useEffect(() => {
    if (twDone && !typewriterDone) {
      const timer = setTimeout(() => setTypewriterDone(true), exitGap)
      return () => clearTimeout(timer)
    }
  }, [twDone, typewriterDone, exitGap])

  const directText = welcomeSlot && !useLiteral ? welcomeSlot.text : ''

  return {
    typewriterDone,
    twDone,
    typewriterDisplayed: useLiteral ? displayedText : directText,
    isTypewriterDone: useLiteral ? typewriterDone : true,
  }
}
