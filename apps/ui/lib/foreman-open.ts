import type { SheetDetent } from '@/components/layout/useSheetResize'

export const FOREMAN_OPEN_STORAGE_KEY = 'rerun:foreman-open'
export const FOREMAN_OPEN_COOKIE = 'rerun-foreman-open'
export const FOREMAN_OPEN_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/**
 * Le point de rupture de la colonne, `md:`. En dessous elle n'est plus une piste de grille mais une
 * sheet posée sur le board : on n'y rouvre jamais rien au chargement, et un geste fait là n'a pas
 * à décider de ce que trouvera le desktop.
 */
export const FOREMAN_COLUMN_QUERY = '(max-width: 767.98px)'

export function parseForemanOpen(value: string | null | undefined): boolean | null {
    if (value === 'open') return true
    if (value === 'closed') return false
    return null
}

export function coversTheBoard(): boolean {
    try {
        return window.matchMedia(FOREMAN_COLUMN_QUERY).matches
    } catch {
        return false
    }
}

/** Ce que la colonne vaut au chargement. Rien de mémorisé sur desktop : elle s'ouvre. */
export function loadForemanOpen(): boolean {
    if (coversTheBoard()) return false
    try {
        return parseForemanOpen(localStorage.getItem(FOREMAN_OPEN_STORAGE_KEY)) ?? true
    } catch {
        return true
    }
}

/**
 * Le localStorage est la préférence, le cookie n'en est que le miroir : c'est lui qui laisse le
 * serveur rendre la bonne colonne, donc ouvrir sans glisser. Même montage que le thème, mais sans
 * `domain=.rerun.build` : la landing n'a rien à en faire.
 */
export function rememberForemanOpen(open: boolean): void {
    if (coversTheBoard()) return
    const value = open ? 'open' : 'closed'
    try {
        localStorage.setItem(FOREMAN_OPEN_STORAGE_KEY, value)
    } catch {}
    const parts = [`${FOREMAN_OPEN_COOKIE}=${value}`, 'path=/', `max-age=${FOREMAN_OPEN_COOKIE_MAX_AGE}`, 'SameSite=Lax']
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}

export const FOREMAN_SHEET_DETENT_STORAGE_KEY = 'rerun:foreman-sheet-detent'

/** Sans cran retenu, la sheet mobile est haute comme son contenu. */
export type ForemanSheetDetent = SheetDetent

export function loadForemanSheetDetent(): ForemanSheetDetent | null {
    try {
        const value = localStorage.getItem(FOREMAN_SHEET_DETENT_STORAGE_KEY)
        return value === 'medium' || value === 'large' ? value : null
    } catch {
        return null
    }
}

/** Pas de cookie : sur mobile la sheet est toujours fermée au chargement, le serveur n'a rien à rendre. */
export function rememberForemanSheetDetent(detent: ForemanSheetDetent): void {
    try {
        localStorage.setItem(FOREMAN_SHEET_DETENT_STORAGE_KEY, detent)
    } catch {}
}
