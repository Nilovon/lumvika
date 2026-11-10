import type { SheetDetent } from '@/components/layout/useSheetResize'

export const SIDE_PANEL_DEFAULT_WIDTH = 640
export const SIDE_PANEL_MIN_WIDTH = 480
export const SIDE_PANEL_MAX_WIDTH = 800
/** Doit rester d'accord avec le `60vw` de la classe `max-w` de `SidePanel`. */
export const SIDE_PANEL_MAX_VIEWPORT_RATIO = 0.6
/** Le panneau flotte sur le board ; doit rester d'accord avec les `md:top-2 md:right-2 md:bottom-2` de `SidePanel`. */
export const SIDE_PANEL_GAP = 8

// Une seule largeur pour tous les panneaux latéraux ; la clé garde son ancien nom pour
// ne pas réinitialiser celle que les utilisateurs ont déjà réglée sur le panneau agent.
export const SIDE_PANEL_WIDTH_STORAGE_KEY = 'rerun-agent-panel-width'

export function getSidePanelMaxWidth(viewportWidth: number): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return SIDE_PANEL_DEFAULT_WIDTH
    return Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(SIDE_PANEL_MAX_WIDTH, Math.floor(viewportWidth * SIDE_PANEL_MAX_VIEWPORT_RATIO)))
}

export function clampSidePanelWidth(width: number, viewportWidth: number): number {
    const safeWidth = Number.isFinite(width) ? Math.round(width) : SIDE_PANEL_DEFAULT_WIDTH
    return Math.min(Math.max(safeWidth, SIDE_PANEL_MIN_WIDTH), getSidePanelMaxWidth(viewportWidth))
}

export function parseSidePanelWidth(value: string | null, viewportWidth: number): number {
    if (value === null || value.trim() === '') return clampSidePanelWidth(SIDE_PANEL_DEFAULT_WIDTH, viewportWidth)

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return clampSidePanelWidth(SIDE_PANEL_DEFAULT_WIDTH, viewportWidth)

    return clampSidePanelWidth(parsed, viewportWidth)
}

export function loadSidePanelWidth(viewportWidth: number): number {
    try {
        return parseSidePanelWidth(localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY), viewportWidth)
    } catch {
        return clampSidePanelWidth(SIDE_PANEL_DEFAULT_WIDTH, viewportWidth)
    }
}

export function saveSidePanelWidth(width: number, viewportWidth: number): number {
    const clamped = clampSidePanelWidth(width, viewportWidth)
    try {
        localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(clamped))
    } catch {}
    return clamped
}

export const SIDE_PANEL_SHEET_DETENT_STORAGE_KEY = 'rerun:agent-sheet-detent'

/** Sous `md` le panneau est une sheet : son contenu n'a pas de hauteur propre, elle s'ouvre au grand cran. */
export function loadSidePanelSheetDetent(): SheetDetent {
    try {
        return localStorage.getItem(SIDE_PANEL_SHEET_DETENT_STORAGE_KEY) === 'medium' ? 'medium' : 'large'
    } catch {
        return 'large'
    }
}

export function rememberSidePanelSheetDetent(detent: SheetDetent): void {
    try {
        localStorage.setItem(SIDE_PANEL_SHEET_DETENT_STORAGE_KEY, detent)
    } catch {}
}
