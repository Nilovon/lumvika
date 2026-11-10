'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useStepper(count: number, initial = 0) {
    const [index, setIndex] = useState(initial)
    const [direction, setDirection] = useState(1)
    const indexRef = useRef(index)
    useEffect(() => {
        indexRef.current = index
    }, [index])

    const goForward = useCallback(() => {
        setDirection(1)
        setIndex(i => Math.min(count - 1, i + 1))
    }, [count])

    const back = useCallback(() => {
        setDirection(-1)
        setIndex(i => Math.max(0, i - 1))
    }, [])

    const goTo = useCallback(
        (target: number) => {
            const clamped = Math.max(0, Math.min(count - 1, target))
            setDirection(clamped >= indexRef.current ? 1 : -1)
            setIndex(clamped)
        },
        [count]
    )

    const reset = useCallback(() => {
        setDirection(1)
        setIndex(initial)
    }, [initial])

    return { index, direction, count, isFirst: index === 0, isLast: index === count - 1, goForward, back, goTo, reset, setDirection }
}
