import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    platform: true,
    claims: { sub: 'user-1', is_anonymous: false } as { sub: string; is_anonymous: boolean } | null,
    redirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT ${path}`)
    }),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/flags', () => ({ platformFlag: async () => mocks.platform }))
vi.mock('@/supabase/server', () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: mocks.claims ? { claims: mocks.claims } : null }) } }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { platformShellOpen } from './platform-access'
import { requirePlatformAccess } from './platform-access.server'

describe('platformShellOpen', () => {
    it('opens the shell to an account once the flag is on', () => {
        expect(platformShellOpen({ platform: true, signedIn: true })).toBe(true)
    })

    it('keeps the board alone with the flag off, or for an anonymous visitor', () => {
        expect(platformShellOpen({ platform: false, signedIn: true })).toBe(false)
        expect(platformShellOpen({ platform: true, signedIn: false })).toBe(false)
    })
})

describe('requirePlatformAccess', () => {
    beforeEach(() => {
        mocks.platform = true
        mocks.claims = { sub: 'user-1', is_anonymous: false }
        mocks.redirect.mockClear()
    })

    it('lets an account through to an area', async () => {
        await expect(requirePlatformAccess()).resolves.toBeUndefined()
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it('sends every area back to the board while the flag is off', async () => {
        mocks.platform = false
        await expect(requirePlatformAccess()).rejects.toThrow('NEXT_REDIRECT /')
    })

    it('sends an anonymous visitor back to the board', async () => {
        mocks.claims = { sub: 'anon-1', is_anonymous: true }
        await expect(requirePlatformAccess()).rejects.toThrow('NEXT_REDIRECT /')
    })

    it('sends a request without a session back to the board', async () => {
        mocks.claims = null
        await expect(requirePlatformAccess()).rejects.toThrow('NEXT_REDIRECT /')
    })
})
