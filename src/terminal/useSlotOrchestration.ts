import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import gsap from 'gsap'
import { useEffectScope } from '../composition/effectScope'
import { collectSlots, type TerminalSlot, type WelcomeSlot } from './slots'
import { useTypewriterGate } from './useTypewriterGate'

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

function slotLabel(name: string) {
  return `slot:${name}`
}

export function useSlotOrchestration(
  childrenOrSlots: ReactNode | TerminalSlot[] | null,
  _active: boolean,
  controlledEchoLines?: string[],
  onEchoLinesChange?: (lines: string[]) => void,
): Result | null {
  const raw = Array.isArray(childrenOrSlots) ? childrenOrSlots : collectSlots(childrenOrSlots)
  const key = raw
    .map((s) => `${s.type}:${s.name}:${s.type === 'welcome' ? s.text : ''}:${s.appearAfter ?? ''}`)
    .join('|')
  const cache = useRef<{ key: string; slots: TerminalSlot[] }>({ key: '', slots: [] })
  if (cache.current.key !== key) cache.current = { key, slots: raw }
  const slots = cache.current.slots
  if (slots.length === 0) return null

  const id = useId()
  const timelineScope = useEffectScope(`terminal.slotTimeline.${id}`)
  const pollScope = useEffectScope(`terminal.slotPoll.${id}`)

  const welcomeSlot = slots.find((s) => s.type === 'welcome') as WelcomeSlot | undefined
  const twCfg = welcomeSlot?.animation
  const useLiteral = twCfg?.inline === 'literal'
  const { typewriterDone, twDone, typewriterDisplayed, isTypewriterDone } = useTypewriterGate(welcomeSlot)

  const [echoLines, setEchoLines] = useState<string[]>(controlledEchoLines ?? [])
  const runtimesRef = useRef<Map<string, SlotRuntime>>(new Map())
  const rollingBufRef = useRef<Map<string, string[]>>(new Map())
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const followingRef = useRef(true)

  const reserveLines = (slot: TerminalSlot, start: number) => {
    const count = slot.lineCount ?? 1
    setEchoLines((prev) => {
      const next = [...prev]
      while (next.length < start + count) next.push('')
      return next
    })
    return { echoStart: start }
  }

  const writeSlotLines = (slotName: string, lines: string[]) => {
    setEchoLines((prev) => {
      const rt = runtimesRef.current.get(slotName)
      if (!rt) return prev
      const next = [...prev]
      for (let i = 0; i < lines.length && rt.echoStart + i < next.length; i += 1) {
        next[rt.echoStart + i] = lines[i]
      }
      return next
    })
  }

  const activateSlot = (slotName: string) => {
    const slot = slots.find((s) => s.name === slotName)
    if (!slot || slot.type === 'welcome') return null

    let echoStart = welcomeSlot ? (welcomeSlot.lineCount ?? 1) : 0
    for (const s of slots) {
      if (s.name === slotName) break
      if (s.type !== 'welcome') echoStart += s.lineCount ?? 1
    }

    const { echoStart: start } = reserveLines(slot, echoStart)
    runtimesRef.current.set(slotName, { slot, active: true, echoStart: start, rollingBuffer: [] })
    const anim = slot.animation
    if (anim?.overflow === 'rolling') rollingBufRef.current.set(slotName, [])
    return slot.type === 'section' ? slot.getLines() : [slot.getLine()]
  }

  const directText = welcomeSlot && !useLiteral ? welcomeSlot.text : ''
  useEffect(() => {
    if (directText && echoLines.length === 0) setEchoLines([directText])
  }, [directText, echoLines.length])

  useEffect(() => {
    if (welcomeSlot && useLiteral && !twDone) setEchoLines([typewriterDisplayed])
  }, [typewriterDisplayed, twDone, welcomeSlot, useLiteral])

  useEffect(() => {
    if (welcomeSlot && !typewriterDone) return undefined

    if (tlRef.current) {
      timelineScope.removeTween(tlRef.current)
      tlRef.current = null
    }

    const activeSlots = slots.filter((s) => s.type !== 'welcome')
    const totalLines = (welcomeSlot?.lineCount ?? 0) +
      activeSlots.reduce((sum, s) => sum + (s.lineCount ?? 1), 0)
    setEchoLines((prev) => prev.slice(0, totalLines))

    if (activeSlots.length === 0) return undefined

    const tl = timelineScope.addTween(gsap.timeline({ paused: true }))
    tlRef.current = tl
    const addedLabels = new Set<string>()

    for (const s of activeSlots) {
      const label = slotLabel(s.name)
      const dep = s.appearAfter
      let position = '>'
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

      tl.call(() => {
        const lines = activateSlot(s.name)
        if (lines) linesCache = lines
      }, [], position)

      if (rows === 'lineByLine' && lineCount > 1) {
        for (let row = 0; row < lineCount; row += 1) {
          const rowPos = row === 0 ? '>' : `+=${rowInterval / 1000}`
          tl.call(() => {
            if (linesCache.length > row) writeSlotLines(s.name, linesCache.slice(0, row + 1))
          }, [], rowPos)
        }
      } else {
        tl.call(() => {
          if (linesCache.length > 0) writeSlotLines(s.name, linesCache)
        }, [], '>')
      }

      tl.addLabel(label, '>+=0.01')
      addedLabels.add(label)
    }

    tl.play()

    return () => {
      timelineScope.removeTween(tl)
      if (tlRef.current === tl) tlRef.current = null
    }
  }, [typewriterDone, slots, timelineScope, welcomeSlot])

  useEffect(() => {
    pollScope.cancel('poll rebuild')

    for (const slot of slots) {
      if (slot.type === 'welcome') continue
      const rt = runtimesRef.current.get(slot.name)
      if (!rt?.active) continue

      const anim = slot.animation
      const interval = anim?.overflow === 'rolling'
        ? (anim?.rollingInterval ?? 1000)
        : (anim?.pollInterval ?? 250)

      pollScope.setInterval(() => {
        const lines = slot.type === 'section' ? slot.getLines() : [slot.getLine()]
        if (anim?.overflow === 'rolling') {
          const max = slot.lineCount ?? 1
          const buf = rollingBufRef.current.get(slot.name) ?? []
          buf.push(lines[0])
          if (buf.length > max) buf.shift()
          rollingBufRef.current.set(slot.name, buf)
          const display = [...buf]
          while (display.length < max) display.push('')
          setEchoLines((prev) => {
            const next = [...prev]
            for (let i = 0; i < max; i += 1) next[rt.echoStart + i] = display[i] ?? ''
            return next
          })
        } else {
          writeSlotLines(slot.name, lines)
        }
      }, interval)
    }

    return () => pollScope.cancel('poll cleanup')
  }, [slots, echoLines.length, pollScope])

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
