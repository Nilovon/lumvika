'use client'

import type { PointerEvent, RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { type StewardCorner, type StewardPlacement, STEWARD_FLOAT_DEFAULT_SIZE, clampStewardFloatSize } from '@/lib/steward-layout'
import { cn } from '@/lib/utils'
import { useStewardStore } from '@/stores/steward.store'

type ResizeState = { pointerId: number; startX: number; startY: number; startWidth: number; startHeight: number; width: number; height: number }

/** La poignée vit sur le coin opposé à celui où la fenêtre est aimantée : ce coin-là ne bouge jamais. */
const HANDLE_CLASSES: Record<StewardCorner, string> = {
    'bottom-right': 'top-0 left-0 cursor-nwse-resize rounded-tl-xl border-t-2 border-l-2',
    'bottom-left': 'top-0 right-0 cursor-nesw-resize rounded-tr-xl border-t-2 border-r-2',
    'top-right': 'bottom-0 left-0 cursor-nesw-resize rounded-bl-xl border-b-2 border-l-2',
    'top-left': 'bottom-0 right-0 cursor-nwse-resize rounded-br-xl border-b-2 border-r-2',
}

export function StewardResizeHandle({ panelRef, placement }: { panelRef: RefObject<HTMLDivElement | null>; placement: StewardPlacement & { mode: 'float' } }) {
    const t = useTranslations('steward')
    const resizeRef = useRef<ResizeState | null>(null)
    const growsLeft = placement.corner.endsWith('right')
    const growsUp = placement.corner.startsWith('bottom')

    const applySize = (width: number, height: number) => {
        const size = clampStewardFloatSize({ width, height }, { width: window.innerWidth, height: window.innerHeight })
        panelRef.current?.style.setProperty('--steward-float-w', `${size.width}px`)
        panelRef.current?.style.setProperty('--steward-float-h', `${size.height}px`)
        return size
    }

    const commit = (width: number, height: number) => useStewardStore.getState().setPlacement({ ...placement, width, height })

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || resizeRef.current) return
        const panel = panelRef.current
        if (!panel) return
        event.preventDefault()
        const rect = panel.getBoundingClientRect()
        resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startWidth: rect.width, startHeight: rect.height, width: rect.width, height: rect.height }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.setAttribute('data-resizing', 'true')
    }

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const resize = resizeRef.current
        if (!resize || resize.pointerId !== event.pointerId) return
        const dx = event.clientX - resize.startX
        const dy = event.clientY - resize.startY
        const size = applySize(resize.startWidth + (growsLeft ? -dx : dx), resize.startHeight + (growsUp ? -dy : dy))
        resize.width = size.width
        resize.height = size.height
    }

    const finishResize = (event: PointerEvent<HTMLDivElement>) => {
        const resize = resizeRef.current
        if (!resize || resize.pointerId !== event.pointerId) return
        resizeRef.current = null
        event.currentTarget.setAttribute('data-resizing', 'false')
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        commit(resize.width, resize.height)
    }

    const resetSize = () => {
        const size = applySize(STEWARD_FLOAT_DEFAULT_SIZE.width, STEWARD_FLOAT_DEFAULT_SIZE.height)
        commit(size.width, size.height)
    }

    return (
        <div
            role="separator"
            aria-label={t('resize')}
            data-resizing="false"
            className={cn(
                'absolute z-30 hidden size-4 touch-none border-transparent transition-colors hover:border-ring/70 data-[resizing=true]:border-ring md:block',
                HANDLE_CLASSES[placement.corner]
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onLostPointerCapture={finishResize}
            onDoubleClick={resetSize}
        />
    )
}
