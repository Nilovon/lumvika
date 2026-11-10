import type { SheetDetent } from '@/components/layout/useSheetResize'

export const STEWARD_OPEN_STORAGE_KEY = 'lumvika:steward-open'
export const STEWARD_OPEN_COOKIE = 'lumvika-steward-open'
export const STEWARD_OPEN_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/**
 * Le point de rupture de la colonne, `md:`. En dessous elle n'est plus une piste de grille mais une
 * sheet posée sur le board : on n'y rouvre jamais rien au chargement, et un geste fait là n'a pas
 * à décider de ce que trouvera le desktop.
 */
export const STEWARD_COLUMN_QUERY = '(max-width: 767.98px)'

export function parseStewardOpen(value: string | null | undefined): boolean | null {
    if (value === 'open') return true
    if (value === 'closed') return false
    return null
}

export function coversTheBoard(): boolean {
    try {
        return window.matchMedia(STEWARD_COLUMN_QUERY).matches
    } catch {
        return false
    }
}

/** Ce que la colonne vaut au chargement. Rien de mémorisé sur desktop : elle s'ouvre. */
export function loadStewardOpen(): boolean {
    if (coversTheBoard()) return false
    try {
        return parseStewardOpen(localStorage.getItem(STEWARD_OPEN_STORAGE_KEY)) ?? true
    } catch {
        return true
    }
}

/**
 * Le localStorage est la préférence, le cookie n'en est que le miroir : c'est lui qui laisse le
 * serveur rendre la bonne colonne, donc ouvrir sans glisser. Même montage que le thème, mais sans
 * `domain=.lumvika.com` : la landing n'a rien à en faire.
 */
export function rememberStewardOpen(open: boolean): void {
    if (coversTheBoard()) return
    const value = open ? 'open' : 'closed'
    try {
        localStorage.setItem(STEWARD_OPEN_STORAGE_KEY, value)
    } catch {}
    const parts = [`${STEWARD_OPEN_COOKIE}=${value}`, 'path=/', `max-age=${STEWARD_OPEN_COOKIE_MAX_AGE}`, 'SameSite=Lax']
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}

export const STEWARD_SHEET_DETENT_STORAGE_KEY = 'lumvika:steward-sheet-detent'

/** Sans cran retenu, la sheet mobile est haute comme son contenu. */
export type StewardSheetDetent = SheetDetent

export function loadStewardSheetDetent(): StewardSheetDetent | null {
    try {
        const value = localStorage.getItem(STEWARD_SHEET_DETENT_STORAGE_KEY)
        return value === 'medium' || value === 'large' ? value : null
    } catch {
        return null
    }
}

/** Pas de cookie : sur mobile la sheet est toujours fermée au chargement, le serveur n'a rien à rendre. */
export function rememberStewardSheetDetent(detent: StewardSheetDetent): void {
    try {
        localStorage.setItem(STEWARD_SHEET_DETENT_STORAGE_KEY, detent)
    } catch {}
}
