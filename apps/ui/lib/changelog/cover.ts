// Kept out of the stage component: a `'use client'` module imported from a server file only yields
// client references, so any plain value read from it comes back undefined.
export const COVER_WIDTH = 1600
export const COVER_HEIGHT = 900

// `banner` is the whole visual, title included, for the public page. `panel` is the block of UI
// alone, for the in-app dialog, which already writes the title beside its image. It is cut to the
// shape of that dialog's right column, which it fills edge to edge.
export const COVER_LAYOUTS = ['banner', 'panel'] as const
export type CoverLayout = (typeof COVER_LAYOUTS)[number]
export const COVER_SIZE: Record<CoverLayout, { width: number; height: number }> = {
    banner: { width: COVER_WIDTH, height: COVER_HEIGHT },
    panel: { width: 800, height: 960 },
}

export const COVER_THEMES = ['dark', 'light'] as const
export type CoverTheme = (typeof COVER_THEMES)[number]
export const COVER_THEME: CoverTheme = 'light'

export const COVER_TONES = ['neutral', 'brand'] as const
export type CoverTone = (typeof COVER_TONES)[number]
export const COVER_TONE: CoverTone = 'neutral'

export const COVER_TITLE_MAX = 60

type RawParam = string | string[] | undefined

const first = (raw: RawParam) => (Array.isArray(raw) ? raw[0] : raw)

export function readCoverTheme(raw: RawParam): CoverTheme {
    const value = first(raw)
    return COVER_THEMES.find(theme => theme === value) ?? COVER_THEME
}

export function readCoverTone(raw: RawParam): CoverTone {
    const value = first(raw)
    return COVER_TONES.find(tone => tone === value) ?? COVER_TONE
}

export function readCoverLayout(raw: RawParam): CoverLayout {
    const value = first(raw)
    return COVER_LAYOUTS.find(layout => layout === value) ?? 'banner'
}

export function readCoverTitle(raw: RawParam): string {
    return (first(raw) ?? '').trim().slice(0, COVER_TITLE_MAX)
}

// The cover is fed by a URL: anything but a same-origin path or an http(s) address is dropped, so a
// `javascript:` or `data:` value never reaches the `src`.
export function readCoverImage(raw: RawParam): string | null {
    const value = first(raw)?.trim()
    if (!value) return null
    if (value.startsWith('/') && !value.startsWith('//')) return value
    return /^https?:\/\//.test(value) ? value : null
}

export function readCoverBlock(raw: RawParam): string | null {
    return first(raw)?.trim() || null
}
