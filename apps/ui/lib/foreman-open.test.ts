import { afterEach, describe, expect, it, vi } from 'vitest'

import { FOREMAN_OPEN_COOKIE, FOREMAN_OPEN_STORAGE_KEY, loadForemanOpen, parseForemanOpen, rememberForemanOpen } from './foreman-open'

function stubBrowser({ coversTheBoard, stored }: { coversTheBoard: boolean; stored?: string }) {
    const storage = new Map<string, string>(stored === undefined ? [] : [[FOREMAN_OPEN_STORAGE_KEY, stored]])
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

describe('foreman open preference', () => {
    it('reads the two values it writes, and nothing else', () => {
        expect(parseForemanOpen('open')).toBe(true)
        expect(parseForemanOpen('closed')).toBe(false)
        expect(parseForemanOpen(null)).toBeNull()
        expect(parseForemanOpen('1')).toBeNull()
    })

    it('opens on a desktop that has never been touched', () => {
        stubBrowser({ coversTheBoard: false })
        expect(loadForemanOpen()).toBe(true)
    })

    it('restores what the desktop chose', () => {
        stubBrowser({ coversTheBoard: false, stored: 'closed' })
        expect(loadForemanOpen()).toBe(false)
    })

    it('stays closed where the column covers the board, whatever was stored', () => {
        stubBrowser({ coversTheBoard: true, stored: 'open' })
        expect(loadForemanOpen()).toBe(false)
    })

    it('mirrors a desktop gesture into the storage and the cookie', () => {
        const { storage, written } = stubBrowser({ coversTheBoard: false })
        rememberForemanOpen(false)
        expect(storage.get(FOREMAN_OPEN_STORAGE_KEY)).toBe('closed')
        expect(written).toHaveLength(1)
        expect(written[0]).toContain(`${FOREMAN_OPEN_COOKIE}=closed`)
        expect(written[0]).toContain('Secure')
    })

    it('writes nothing from a phone', () => {
        const { storage, written } = stubBrowser({ coversTheBoard: true })
        rememberForemanOpen(true)
        expect(storage.size).toBe(0)
        expect(written).toHaveLength(0)
    })
})
