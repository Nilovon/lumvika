import { afterEach, describe, expect, it, vi } from 'vitest'

import { STEWARD_OPEN_COOKIE, STEWARD_OPEN_STORAGE_KEY, loadStewardOpen, parseStewardOpen, rememberStewardOpen } from './steward-open'

function stubBrowser({ coversTheBoard, stored }: { coversTheBoard: boolean; stored?: string }) {
    const storage = new Map<string, string>(stored === undefined ? [] : [[STEWARD_OPEN_STORAGE_KEY, stored]])
    const written: string[] = []

    vi.stubGlobal('window', { matchMedia: () => ({ matches: coversTheBoard }), location: { protocol: 'https:' } })
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
    })
    vi.stubGlobal('document', {
        set cookie(value: string) {
            written.push(value)
        },
    })

    return { storage, written }
}

afterEach(() => vi.unstubAllGlobals())

describe('steward open preference', () => {
    it('reads the two values it writes, and nothing else', () => {
        expect(parseStewardOpen('open')).toBe(true)
        expect(parseStewardOpen('closed')).toBe(false)
        expect(parseStewardOpen(null)).toBeNull()
        expect(parseStewardOpen('1')).toBeNull()
    })

    it('opens on a desktop that has never been touched', () => {
        stubBrowser({ coversTheBoard: false })
        expect(loadStewardOpen()).toBe(true)
    })

    it('restores what the desktop chose', () => {
        stubBrowser({ coversTheBoard: false, stored: 'closed' })
        expect(loadStewardOpen()).toBe(false)
    })

    it('stays closed where the column covers the board, whatever was stored', () => {
        stubBrowser({ coversTheBoard: true, stored: 'open' })
        expect(loadStewardOpen()).toBe(false)
    })

    it('mirrors a desktop gesture into the storage and the cookie', () => {
        const { storage, written } = stubBrowser({ coversTheBoard: false })
        rememberStewardOpen(false)
        expect(storage.get(STEWARD_OPEN_STORAGE_KEY)).toBe('closed')
        expect(written).toHaveLength(1)
        expect(written[0]).toContain(`${STEWARD_OPEN_COOKIE}=closed`)
        expect(written[0]).toContain('Secure')
    })

    it('writes nothing from a phone', () => {
        const { storage, written } = stubBrowser({ coversTheBoard: true })
        rememberStewardOpen(true)
        expect(storage.size).toBe(0)
        expect(written).toHaveLength(0)
    })
})
