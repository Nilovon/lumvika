'use client'

import type { RefObject } from 'react'

import { useSheetResize } from '@/components/layout/useSheetResize'
import { loadStewardSheetDetent, rememberStewardSheetDetent } from '@/lib/steward-open'
import { useStewardStore } from '@/stores/steward.store'

const closeSteward = () => useStewardStore.getState().close()
const outsideTheFunnel = () => useStewardStore.getState().funnel !== 'guided'

/** Sans cran retenu, la sheet du Steward est haute comme son contenu (voir `useStewardSheetHeight`). */
export function useStewardSheetResize({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) {
    return useSheetResize({
        panelRef,
        dragVar: '--steward-sheet-drag-h',
        detentVar: '--steward-sheet-detent-h',
        loadDetent: loadStewardSheetDetent,
        rememberDetent: rememberStewardSheetDetent,
        onDismiss: closeSteward,
        canDismiss: outsideTheFunnel,
    })
}
