import { useId, useLayoutEffect, useRef } from 'react'
import { useEffectScope } from '../composition/effectScope'

interface AnimateHeightOptions {
  /** Animation duration per changed line, in seconds. */
  durationPerLine?: number
  /** Called after the height transition settles. */
  onComplete?: () => void
}

export function useAnimateHeight(
  getElement: () => HTMLElement | null | undefined,
  items: readonly unknown[],
  options: AnimateHeightOptions = {},
): void {
  const lineCount = items.length
  const prevLineCount = useRef(lineCount)
  const prevHeightRef = useRef(0)
  const animatingRef = useRef(false)
  const id = useId()
  const scope = useEffectScope(`terminal.animateHeight.${id}`)

  const getElRef = useRef(getElement)
  getElRef.current = getElement
  const optsRef = useRef(options)
  optsRef.current = options

  useLayoutEffect(() => {
    const el = getElRef.current()
    if (!el) return undefined

    const { durationPerLine = 0.3, onComplete } = optsRef.current

    const prev = prevLineCount.current
    const curr = lineCount
    prevLineCount.current = curr

    const newH = el.scrollHeight
    const oldH = prevHeightRef.current

    let animating = false
    let lineDelta = 0

    if (curr < prev && oldH > 0 && newH < oldH) {
      animating = true
      lineDelta = prev - curr
      animatingRef.current = true
      el.style.overflow = 'hidden'
      el.style.height = `${oldH}px`
      el.style.transition = `height ${lineDelta * durationPerLine}s ease`
      el.offsetHeight
      el.style.height = `${newH}px`
    } else if (curr > prev && oldH > 0) {
      animating = true
      lineDelta = curr - prev
      if (!animatingRef.current) {
        animatingRef.current = true
        el.style.overflow = 'hidden'
        el.style.height = `${oldH}px`
        el.style.transition = `height ${durationPerLine}s ease`
        el.offsetHeight
        el.style.height = `${newH}px`
      } else {
        el.style.height = `${newH}px`
      }
    } else if (curr === prev && oldH > 0 && newH !== oldH && !animatingRef.current) {
      onComplete?.()
    }

    prevHeightRef.current = el.scrollHeight

    if (!animating) return undefined

    let finished = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const dispose = () => {
      el.removeEventListener('transitionend', finish)
      scope.clearTimer(timer)
      scope.removeCleanup(dispose)
    }
    const finish = () => {
      if (finished) return
      finished = true
      el.style.height = ''
      el.style.transition = ''
      el.style.overflow = ''
      animatingRef.current = false
      dispose()
      onComplete?.()
    }

    el.addEventListener('transitionend', finish, { once: true })
    timer = scope.setTimeout(finish, lineDelta * durationPerLine * 1000 + 200)
    scope.addCleanup(dispose)

    return dispose
  }, [items, lineCount, scope])
}
