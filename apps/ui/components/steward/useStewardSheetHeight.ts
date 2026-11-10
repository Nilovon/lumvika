'use client'

import { useEffect, type RefObject } from 'react'
import { useIsMobile } from '@lumvika/ui/primitives/use-is-mobile'

import { STEWARD_COLUMN_QUERY } from '@/lib/steward-open'

/**
 * Sous `md` le Steward est une sheet haute comme ce qu'elle porte : la pile de messages plus le pied.
 * La somme est écrite dans `--steward-sheet-h` directement sur le panneau, sans passer par un state,
 * pour que la sheet suive le streaming sans re-rendre la colonne à chaque token. Le plancher et le
 * plafond sont dans le `clamp` CSS du panneau. Le pied seul part aussi dans `--steward-sheet-slot-h` :
 * tirée sur un cran, la sheet ne descend jamais sous lui, sinon la carte d'intake y perdrait son bouton.
 */
export function useStewardSheetHeight({ panelRef, stackEl, slotEl }: { panelRef: RefObject<HTMLElement | null>; stackEl: HTMLElement | null; slotEl: HTMLElement | null }) {
    const isMobile = useIsMobile(STEWARD_COLUMN_QUERY)

    useEffect(() => {
        const panel = panelRef.current
        if (!isMobile || !panel || !stackEl || !slotEl) return
        const publish = () => {
            const border = panel.offsetHeight - panel.clientHeight
            panel.style.setProperty('--steward-sheet-h', `${stackEl.offsetHeight + slotEl.offsetHeight + border}px`)
            panel.style.setProperty('--steward-sheet-slot-h', `${slotEl.offsetHeight + border}px`)
        }
        publish()
        const observer = new ResizeObserver(publish)
        observer.observe(stackEl)
        observer.observe(slotEl)
        return () => {
            observer.disconnect()
            panel.style.removeProperty('--steward-sheet-h')
            panel.style.removeProperty('--steward-sheet-slot-h')
        }
    }, [isMobile, panelRef, stackEl, slotEl])
}
