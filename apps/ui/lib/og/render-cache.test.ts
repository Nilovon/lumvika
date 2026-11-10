import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOgCache, ogResponse } from './render-cache'

const png = (text: string) => Buffer.from(text)

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('createOgCache', () => {
    it('serves an entry until its TTL is reached, then forgets it', () => {
        const cache = createOgCache({ ttlMs: 1000, maxEntries: 5 })
        cache.set('a', png('a'), 'image/png')
        vi.setSystemTime(999)
        expect(cache.get('a')?.body.toString()).toBe('a')
        vi.setSystemTime(1000)
        expect(cache.get('a')).toBeNull()
    })

    it('evicts the oldest insertion once full, even if it was read recently', () => {
        const cache = createOgCache({ ttlMs: 10_000, maxEntries: 2 })
        cache.set('a', png('a'), 'image/png')
        cache.set('b', png('b'), 'image/png')
        cache.get('a')
        cache.set('c', png('c'), 'image/png')
        expect(cache.get('a')).toBeNull()
        expect(cache.get('b')).not.toBeNull()
        expect(cache.get('c')).not.toBeNull()
    })

    it('restarts the TTL of a key written again', () => {
        const cache = createOgCache({ ttlMs: 1000, maxEntries: 5 })
        cache.set('a', png('old'), 'image/png')
        vi.setSystemTime(800)
        cache.set('a', png('new'), 'image/jpeg')
        vi.setSystemTime(1500)
        expect(cache.get('a')).toMatchObject({ contentType: 'image/jpeg', expiresAt: 1800 })
    })

    it('keeps caches independent of each other', () => {
        const first = createOgCache({ ttlMs: 1000, maxEntries: 5 })
        const second = createOgCache({ ttlMs: 1000, maxEntries: 5 })
        first.set('a', png('a'), 'image/png')
        expect(second.get('a')).toBeNull()
    })
})

describe('ogResponse', () => {
    it('answers the bytes with a long shared cache', async () => {
        const res = ogResponse(png('img'), 'image/png')
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toContain('s-maxage=86400')
        expect(await res.text()).toBe('img')
    })
})
