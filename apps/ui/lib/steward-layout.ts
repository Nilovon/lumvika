import { coversTheBoard } from '@/lib/steward-open'

export type StewardCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type StewardDockSide = 'left' | 'right'

/**
 * Où la colonne se pose à partir de `md`. `width` et `height` sont la taille de la fenêtre flottante,
 * `dockWidth` la largeur de la piste docké : les deux voyagent avec l'autre mode, redocker puis
 * refaire flotter rend chaque taille qu'on avait tirée.
 */
export type StewardPlacement = ({ mode: 'dock'; side: StewardDockSide } | { mode: 'float'; corner: StewardCorner }) & StewardSizes
type StewardSizes = { width: number; height: number; dockWidth: number }

export const STEWARD_PLACEMENT_STORAGE_KEY = 'lumvika:steward-placement'
export const STEWARD_PLACEMENT_COOKIE = 'lumvika-steward-placement'
const STEWARD_PLACEMENT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export const STEWARD_ORB_CORNER_STORAGE_KEY = 'lumvika:steward-orb-corner'

export const STEWARD_FLOAT_DEFAULT_SIZE = { width: 480, height: 720 }
export const STEWARD_FLOAT_MIN_SIZE = { width: 360, height: 420 }
export const STEWARD_DOCK_DEFAULT_WIDTH = 480
export const STEWARD_DOCK_MIN_WIDTH = 360
const STEWARD_DOCK_MAX_WIDTH = 800
/** La part de l'écran que la piste docké peut prendre au board. Doit rester d'accord avec le `60vw` des classes de piste. */
const STEWARD_DOCK_MAX_VIEWPORT_SHARE = 0.6
/** L'écart au bord de l'écran sous lequel lâcher la colonne la docke au lieu de la faire flotter. */
const DOCK_SNAP_DISTANCE = 80
/** Ce que la fenêtre flottante laisse autour d'elle : 1rem de marge plus l'inset du board, de chaque côté. */
const FLOAT_VIEWPORT_GUTTER = 50

export const DEFAULT_STEWARD_PLACEMENT: StewardPlacement = { mode: 'dock', side: 'right', ...STEWARD_FLOAT_DEFAULT_SIZE, dockWidth: STEWARD_DOCK_DEFAULT_WIDTH }

const CORNERS: readonly StewardCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
// Le suffixe de largeur du dock est arrivé après coup : un cookie écrit sans lui reste valide.
const PLACEMENT_PATTERN = /^(dock|float)-(left|right|top-left|top-right|bottom-left|bottom-right):(\d{2,4})x(\d{2,4})(?::(\d{2,4}))?$/

export function isStewardCorner(value: unknown): value is StewardCorner {
    return typeof value === 'string' && (CORNERS as readonly string[]).includes(value)
}

export function serializeStewardPlacement(placement: StewardPlacement): string {
    const anchor = placement.mode === 'dock' ? placement.side : placement.corner
    return `${placement.mode}-${anchor}:${Math.round(placement.width)}x${Math.round(placement.height)}:${Math.round(placement.dockWidth)}`
}

export function parseStewardPlacement(value: string | null | undefined): StewardPlacement | null {
    const match = value ? PLACEMENT_PATTERN.exec(value) : null
    if (!match) return null
    const [, mode, anchor, width, height, dockWidth] = match
    const size = {
        width: Math.max(STEWARD_FLOAT_MIN_SIZE.width, Number(width)),
        height: Math.max(STEWARD_FLOAT_MIN_SIZE.height, Number(height)),
        dockWidth: dockWidth ? Math.min(STEWARD_DOCK_MAX_WIDTH, Math.max(STEWARD_DOCK_MIN_WIDTH, Number(dockWidth))) : STEWARD_DOCK_DEFAULT_WIDTH,
    }
    if (mode === 'dock' && (anchor === 'left' || anchor === 'right')) return { mode, side: anchor, ...size }
    if (mode === 'float' && isStewardCorner(anchor)) return { mode, corner: anchor, ...size }
    return null
}

export function loadStewardPlacement(): StewardPlacement {
    try {
        return parseStewardPlacement(localStorage.getItem(STEWARD_PLACEMENT_STORAGE_KEY)) ?? DEFAULT_STEWARD_PLACEMENT
    } catch {
        return DEFAULT_STEWARD_PLACEMENT
    }
}

/** Même montage que l'ouverture (lib/steward-open) : le cookie laisse le serveur rendre la colonne déjà à sa place. */
export function rememberStewardPlacement(placement: StewardPlacement): void {
    if (coversTheBoard()) return
    const value = serializeStewardPlacement(placement)
    try {
        localStorage.setItem(STEWARD_PLACEMENT_STORAGE_KEY, value)
    } catch {}
    const parts = [`${STEWARD_PLACEMENT_COOKIE}=${value}`, 'path=/', `max-age=${STEWARD_PLACEMENT_COOKIE_MAX_AGE}`, 'SameSite=Lax']
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}

export function loadStewardOrbCorner(): StewardCorner {
    try {
        const stored = localStorage.getItem(STEWARD_ORB_CORNER_STORAGE_KEY)
        return isStewardCorner(stored) ? stored : 'bottom-right'
    } catch {
        return 'bottom-right'
    }
}

export function rememberStewardOrbCorner(corner: StewardCorner): void {
    try {
        localStorage.setItem(STEWARD_ORB_CORNER_STORAGE_KEY, corner)
    } catch {}
}

type Point = { x: number; y: number }
type Size = { width: number; height: number }

export function resolveCorner(point: Point, viewport: Size): StewardCorner {
    const vertical = point.y < viewport.height / 2 ? 'top' : 'bottom'
    const horizontal = point.x < viewport.width / 2 ? 'left' : 'right'
    return `${vertical}-${horizontal}`
}

/**
 * La place où la colonne atterrira si on la lâche maintenant. Le dock se décide sur le pointeur, qui
 * doit toucher le bord ; le coin sur le centre de la fenêtre, qui est ce que l'œil voit bouger.
 */
export function resolveDropTarget({ pointer, panelCenter, viewport, size }: { pointer: Point; panelCenter: Point; viewport: Size; size: StewardSizes }): StewardPlacement {
    if (pointer.x <= DOCK_SNAP_DISTANCE) return { mode: 'dock', side: 'left', ...size }
    if (pointer.x >= viewport.width - DOCK_SNAP_DISTANCE) return { mode: 'dock', side: 'right', ...size }
    return { mode: 'float', corner: resolveCorner(panelCenter, viewport), ...size }
}

export function clampStewardFloatSize(size: Size, viewport: Size): Size {
    const maxWidth = Math.max(STEWARD_FLOAT_MIN_SIZE.width, viewport.width - FLOAT_VIEWPORT_GUTTER)
    const maxHeight = Math.max(STEWARD_FLOAT_MIN_SIZE.height, viewport.height - FLOAT_VIEWPORT_GUTTER)
    return {
        width: Math.round(Math.min(maxWidth, Math.max(STEWARD_FLOAT_MIN_SIZE.width, size.width))),
        height: Math.round(Math.min(maxHeight, Math.max(STEWARD_FLOAT_MIN_SIZE.height, size.height))),
    }
}

export function clampStewardDockWidth(width: number, viewportWidth: number): number {
    const maxWidth = Math.max(STEWARD_DOCK_MIN_WIDTH, Math.min(STEWARD_DOCK_MAX_WIDTH, viewportWidth * STEWARD_DOCK_MAX_VIEWPORT_SHARE))
    return Math.round(Math.min(maxWidth, Math.max(STEWARD_DOCK_MIN_WIDTH, width)))
}

export function sameStewardPlacement(a: StewardPlacement, b: StewardPlacement): boolean {
    return serializeStewardPlacement(a) === serializeStewardPlacement(b)
}

/** The narrowest content card a page keeps beside the docked column. */
export const STEWARD_DOCK_MIN_CONTENT_WIDTH = 640
/** The frame's padding on both sides of the card (`md:p-2`). */
const FRAME_PADDING_X = 16
/** The sidebar's share of the frame, gap included, as BoardChatSplit publishes it in `--shell-sidebar-w`. */
export const SHELL_SIDEBAR_RAIL_WIDTH = 52
export const SHELL_SIDEBAR_EXPANDED_WIDTH = 240

/**
 * The widths, from `md` up, where docking the column would leave a page's card narrower than
 * STEWARD_DOCK_MIN_CONTENT_WIDTH. `sidebarWidth` is what the sidebar takes from `lg` up (0 without
 * one): under `lg` it is a rail, and with any dock width the threshold already lies above `lg`. At
 * the threshold the `60vw` cap of the track never bites, so the dock width counts in full.
 */
export function stewardDockSqueezeQuery({ dockWidth, sidebarWidth }: { dockWidth: number; sidebarWidth: number }): string {
    const minViewportWidth = STEWARD_DOCK_MIN_CONTENT_WIDTH + FRAME_PADDING_X + sidebarWidth + dockWidth
    return `(min-width: 768px) and (max-width: ${minViewportWidth - 0.02}px)`
}

/** Le côté dont la colonne occupe une piste de grille, ou `null` quand elle flotte, se déplace ou est fermée. */
export function dockedStewardSide({ open, placement, dragging }: { open: boolean | null; placement: StewardPlacement; dragging: boolean }): StewardDockSide | null {
    if (open === false || dragging || placement.mode !== 'dock') return null
    return placement.side
}
