import { afterEach, describe, expect, it, vi } from 'vitest'

import { randomUuid } from './random-uuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomUuid', () => {
    afterEach(() => {
        delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID
        vi.restoreAllMocks()
    })

    it('uses crypto.randomUUID in a secure context', () => {
        const spy = vi.spyOn(globalThis.crypto, 'randomUUID')
        expect(randomUuid()).toMatch(UUID_V4)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('builds a v4 UUID when randomUUID is missing, as on plain HTTP over a LAN IP', () => {
        Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
        const ids = Array.from({ length: 50 }, randomUuid)
        for (const id of ids) expect(id).toMatch(UUID_V4)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
