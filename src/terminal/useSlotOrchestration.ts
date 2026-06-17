import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import gsap from 'gsap'
import { collectSlots, type TerminalSlot, type WelcomeSlot } from './slots'
import { useTypewriterGate } from './useTypewriterGate'

// ============================================================
// useSlotOrchestration — GSAP Timeline + 完整动画模型
//
// 所有内容写入操作均在 GSAP timeline 上：
//   rows:lineByLine → 每行独立 call，间隔 rowInterval
//   rows:directly   → 一次性 call
//   label 放在所有行写入完成之后 —— 下游 appearAfter 自然等待
// ============================================================

interface SlotRuntime {
  slot: TerminalSlot
  active: boolean
  echoStart: number
  rollingBuffer: string[]
}

export interface AnchorAPI {
  follow(): void
  release(): void
  isFollowing(): boolean
}

interface Result {
  echoLines: string[]
  typewriterDisplayed: string
  isTypewriterDone: boolean
  anchor: AnchorAPI
}

function slotLabel(name: string) { return `slot:${name}` }

export function useSlotOrchestration(
  childrenOrSlots: ReactNode | TerminalSlot[] | null,
  _active: boolean,
  controlledEchoLines?: string[],
  onEchoLinesChange?: (lines: string[]) => void,
): Result | null {
  const raw = Array.isArray(childrenOrSlots) ? childrenOrSlots : collectSlots(childrenOrSlots)
  const key = raw.map(s => `${s.type}:${s.name}:${s.type === 'welcome' ? s.text : ''}:${s.appearAfter ?? ''}`).join('|')
  const cache = useRef<{ key: string; slots: TerminalSlot[] }>({ key: '', slots: [] })
  if (cache.current.key !== key) cache.current = { key, slots: raw }
  const slots = cache.current.slots
  if (slots.length === 0) return null

  const welcomeSlot = slots.find(s => s.type === 'welcome') as WelcomeSlot | undefined
  const twCfg = welcomeSlot?.animation
  const useLiteral = twCfg?.inline === 'literal'
  const { typewriterDone, twDone, typewriterDisplayed, isTypewriterDone } = useTypewriterGate(welcomeSlot)

  const [echoLines, setEchoLines] = useState<string[]>(controlledEchoLines ?? [])
  const runtimesRef = useRef<Map<string, SlotRuntime>>(new Map())
  const rollingBufRef = useRef<Map<string, string[]>>(new Map())
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const followingRef = useRef(true) // anchor: follow by default

  const reserveLines = (slot: TerminalSlot, start: number) => {
    const count = slot.lineCount ?? 1
    setEchoLines(prev => {
      const next = [...prev]
      while (next.length < start + count) next.push('')
      return next
    })
    return { echoStart: start }
  }

  const writeSlotLines = (slotName: string, lines: string[]) => {
    setEchoLines(prev => {
      const rt = runtimesRef.current.get(slotName)
      if (!rt) return prev
      const next = [...prev]
      for (let i = 0; i < lines.length && rt.echoStart + i < next.length; i++) {
        next[rt.echoStart + i] = lines[i]
      }
      return next
    })
  }

  // 激活 slot（仅预留行位 + 标记 active + 返回内容）
  const activateSlot = (slotName: string) => {
    const slot = slots.find(s => s.name === slotName)
    if (!slot || slot.type === 'welcome') return null
    let echoStart = welcomeSlot ? (welcomeSlot.lineCount ?? 1) : 0
    for (const s of slots) {
      if (s.name === slotName) break
      if (s.type === 'welcome') continue
      echoStart += s.lineCount ?? 1
    }
    const { echoStart: start } = reserveLines(slot, echoStart)
    runtimesRef.current.set(slotName, { slot, active: true, echoStart: start, rollingBuffer: [] })
    const anim = slot.animation
    if (anim?.overflow === 'rolling') rollingBufRef.current.set(slotName, [])
    const lines = slot.type === 'section' ? slot.getLines() : [slot.getLine()]
    return lines
  }

  // Typewriter（直接显示模式）
  const directText = welcomeSlot && !useLiteral ? welcomeSlot.text : ''
  useEffect(() => {
    if (directText && echoLines.length === 0) setEchoLines([directText])
  }, [directText, echoLines.length])

  // Typewriter 进度
  useEffect(() => {
    if (welcomeSlot && useLiteral && !twDone) setEchoLines([typewriterDisplayed])
  }, [typewriterDisplayed, twDone, welcomeSlot, useLiteral])

  // ---- GSAP Timeline：所有内容写入均在此 timeline 上 ----
  useEffect(() => {
    if (welcomeSlot && !typewriterDone) return
    tlRef.current?.kill()
    const activeSlots = slots.filter(s => s.type !== 'welcome')

    // 截断 echoLines 至当前 slot 总行数（移除已消失 slot 的残留行）
    const totalLines = (welcomeSlot?.lineCount ?? 0) +
      activeSlots.reduce((sum, s) => sum + (s.lineCount ?? 1), 0)
    setEchoLines(prev => prev.slice(0, totalLines))

    if (activeSlots.length === 0) return

    const tl = gsap.timeline({ paused: true })
    tlRef.current = tl
    const addedLabels = new Set<string>()

    for (const s of activeSlots) {
      const label = slotLabel(s.name)
      const dep = s.appearAfter
      let position: string = '>'
      if (dep) {
        const depName = dep.includes(':') ? dep.split(':').pop()! : dep
        position = `${slotLabel(depName)}+=0.05`
        if (!addedLabels.has(dep)) {
          tl.addLabel(slotLabel(depName), '+=0')
          addedLabels.add(dep)
        }
      }

      const anim = s.animation
      const rows = anim?.rows ?? 'directly'
      const rowInterval = anim?.rowInterval ?? 250
      const lineCount = s.lineCount ?? 1
      let linesCache: string[] = []

      // Step 1: 激活（预留行位 + 获取内容）
      tl.call(() => { const l = activateSlot(s.name); if (l) linesCache = l }, [], position)

      // Step 2: 写内容 —— 全部在 timeline 上
      if (rows === 'lineByLine' && lineCount > 1) {
        for (let r = 0; r < lineCount; r++) {
          const rowPos = r === 0 ? '>' : `+=${rowInterval / 1000}`
          tl.call(() => {
            if (linesCache.length > r) writeSlotLines(s.name, linesCache.slice(0, r + 1))
          }, [], rowPos)
        }
      } else {
        tl.call(() => { if (linesCache.length > 0) writeSlotLines(s.name, linesCache) }, [], '>')
      }

      // label 在内容写入完成之后 → 下游 appearAfter 自然等待
      tl.addLabel(label, '>+=0.01')
      addedLabels.add(label)
    }

    tl.play()
  }, [typewriterDone, slots])

  // ---- 定时轮询（Section 刷新 + ContentLine rolling） ----
  const pollRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  useEffect(() => {
    // 清理所有旧 timer，清空 Map
    pollRef.current.forEach(t => clearInterval(t))
    pollRef.current.clear()

    for (const slot of slots) {
      if (slot.type === 'welcome') continue
      const rt = runtimesRef.current.get(slot.name)
      if (!rt?.active) continue

      const anim = slot.animation
      const interval = anim?.overflow === 'rolling'
        ? (anim?.rollingInterval ?? 1000)
        : (anim?.pollInterval ?? 250)

      const timer = setInterval(() => {
        const lines = slot.type === 'section' ? slot.getLines() : [slot.getLine()]
        if (anim?.overflow === 'rolling') {
          // 累积缓冲区，满 lineCount 行后开始 FIFO shift
          const max = slot.lineCount ?? 1
          const buf = rollingBufRef.current.get(slot.name) ?? []
          buf.push(lines[0])
          if (buf.length > max) buf.shift()
          rollingBufRef.current.set(slot.name, buf)
          // 填充至 lineCount 行（不足时尾部留空）
          const display = [...buf]
          while (display.length < max) display.push('')
          setEchoLines(prev => {
            const next = [...prev]
            const start = rt.echoStart
            for (let i = 0; i < max; i++) next[start + i] = display[i] ?? ''
            return next
          })
        } else {
          writeSlotLines(slot.name, lines)
        }
      }, interval)
      pollRef.current.set(slot.name, timer)
    }
    return () => { pollRef.current.forEach(t => clearInterval(t)) }
  }, [slots, echoLines.length])

  useEffect(() => () => { tlRef.current?.kill() }, [])

  // Controlled mode: sync echoLines to external store (write-only)
  const prevEchoRef = useRef(echoLines)
  useEffect(() => {
    if (onEchoLinesChange && echoLines !== prevEchoRef.current) {
      prevEchoRef.current = echoLines
      onEchoLinesChange(echoLines)
    }
  }, [echoLines, onEchoLinesChange])

  const anchor: AnchorAPI = {
    follow: () => { followingRef.current = true },
    release: () => { followingRef.current = false },
    isFollowing: () => followingRef.current,
  }

  return {
    echoLines,
    typewriterDisplayed,
    isTypewriterDone,
    anchor,
  }
}
