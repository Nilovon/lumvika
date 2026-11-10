'use client'

import type { RefObject } from 'react'

import { useSheetResize } from '@/components/layout/useSheetResize'
import { loadForemanSheetDetent, rememberForemanSheetDetent } from '@/lib/foreman-open'
import { useForemanStore } from '@/stores/foreman.store'

const closeForeman = () => useForemanStore.getState().close()
const outsideTheFunnel = () => useForemanStore.getState().funnel !== 'guided'

/** Sans cran retenu, la sheet du Foreman est haute comme son contenu (voir `useForemanSheetHeight`). */
export function useForemanSheetResize({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) {
    return useSheetResize({
        panelRef,
        dragVar: '--foreman-sheet-drag-h',
        detentVar: '--foreman-sheet-detent-h',
        loadDetent: loadForemanSheetDetent,
        rememberDetent: rememberForemanSheetDetent,
        onDismiss: closeForeman,
        canDismiss: outsideTheFunnel,
    })
}
