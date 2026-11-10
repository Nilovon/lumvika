// Kept out of the stage component: a `'use client'` module imported from a server file only yields
// client references, so any plain value read from it comes back undefined.
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

// The isogrid board is DOM and SVG blown up by a CSS scale, so at DPR 1 its 8px tile labels and 1px
// edges get rasterised at their tiny CSS size and stretched. Capturing at 2x rasterises them sharp.
export const OG_SCALE = 2

// The frame of the template card thumbnail, and the zoom the board is fitted at inside it, live
// beside the board itself: the live twin a card swaps in under the cursor is laid out at the very
// same numbers, and the two drifting apart would make the swap jump.
export { CARD_HEIGHT, CARD_MAX_ZOOM, CARD_WIDTH } from '@rerun/ui/iso-grid/card-capture'

// Captured at 2x for the same reason as the OG card above.
export const CARD_SCALE = 2

// The board is fully theme-aware (cf. the :root / .dark palettes in @rerun/ui), so the thumbnail can
// be captured either way. The background is stated here rather than taken from --background: the
// brand near-black is a step darker than the token, and the OG card already uses it.
export const CARD_THEMES = ['dark', 'light'] as const
export type CardTheme = (typeof CARD_THEMES)[number]
export const CARD_BACKGROUND: Record<CardTheme, string> = { dark: '#0a0a0a', light: '#fafafa' }
export const CARD_THEME: CardTheme = 'dark'
