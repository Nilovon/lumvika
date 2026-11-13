import type { CSSProperties } from 'react'

import type { StewardCorner, StewardPlacement } from '@/lib/steward-layout'

/**
 * Les coins de la fenêtre flottante, à la même distance du bord visible que le mobilier du board
 * (1rem dans la carte, elle-même rentrée de --board-inset). En toutes lettres pour Tailwind, et en
 * classes plutôt qu'en pixels mesurés : le serveur rend la fenêtre déjà dans son coin.
 */
export const FLOAT_CORNER_CLASSES: Record<StewardCorner, string> = {
    'top-left': 'md:top-[calc(1rem+var(--board-inset,0px))] md:left-[calc(1rem+var(--board-inset-start,var(--board-inset,0px)))] md:origin-top-left',
    'top-right': 'md:top-[calc(1rem+var(--board-inset,0px))] md:right-[calc(1rem+var(--board-inset,0px))] md:origin-top-right',
    'bottom-left': 'md:bottom-[calc(1rem+var(--board-inset,0px)+var(--consent-inset))] md:left-[calc(1rem+var(--board-inset-start,var(--board-inset,0px)))] md:origin-bottom-left',
    'bottom-right': 'md:bottom-[calc(1rem+var(--board-inset,0px)+var(--consent-inset))] md:right-[calc(1rem+var(--board-inset,0px))] md:origin-bottom-right',
}

/** La taille tirée, bornée par l'écran en CSS : une fenêtre rapetissée n'a rien à recalculer. */
export const FLOAT_SIZE_CLASSES =
    'md:w-(--steward-float-w) md:h-(--steward-float-h) md:max-w-[calc(100vw-2rem-2*var(--board-inset,0px))] md:max-h-[calc(100dvh-2rem-2*var(--board-inset,0px))]'

export function floatSizeStyle(placement: StewardPlacement): CSSProperties {
    return { '--steward-float-w': `${placement.width}px`, '--steward-float-h': `${placement.height}px` } as CSSProperties
}
