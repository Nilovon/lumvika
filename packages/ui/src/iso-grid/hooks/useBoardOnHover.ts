'use client'

import { useIsMobile } from '../../primitives/use-is-mobile'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react'

// A hover has to last this long before the board takes over. Sweeping the grid to reach a card at
// the far end crosses every card on the way, and each takeover mounts a live IsoGrid: without the
// wait, one flick of the wrist would mount and tear down a dozen of them. It also covers the cursor
// left resting on the grid while the page scrolls, where it is the cards that travel under it and
// each one entered fires as if it had been aimed at.
const INTENT_DELAY = 260

// Whether a card should be showing its board drawing itself rather than its captured thumbnail. The
// state is the card's own: only one card is ever under the cursor, so nothing has to be arbitrated
// higher up.
export function useBoardOnHover(available: boolean) {
    const reduceMotion = useReducedMotion() ?? false
    // Neither a live board nor a hover means anything on a phone, and drawing one is precisely what
    // "reduce motion" asks us not to do.
    const isMobile = useIsMobile()
    const enabled = available && !reduceMotion && !isMobile

    const [live, setLive] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    const stop = useCallback(() => {
        clearTimeout(timer.current)
        setLive(false)
    }, [])

    useEffect(() => () => clearTimeout(timer.current), [])

    const start = useCallback(() => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setLive(true), INTENT_DELAY)
    }, [])

    const handlers = enabled
        ? {
              onPointerEnter: (event: ReactPointerEvent) => {
                  if (event.pointerType !== 'mouse') return
                  start()
              },
              onPointerLeave: stop,
              // Mirrors what the price flip already answers to, so the card does not half wake up
              // for a keyboard user. `target` and not `currentTarget`: on a card whose root is
              // itself focusable the two are the same, but a card that is a plain box wrapping a
              // link sees the link take the focus.
              onFocus: (event: ReactFocusEvent<HTMLElement>) => {
                  if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) start()
              },
              onBlur: stop,
          }
        : {}

    return { live: enabled && live, handlers }
}
