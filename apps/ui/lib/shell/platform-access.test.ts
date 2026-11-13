import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    platform: true,
    user: { id: 'user-1', isAnonymous: false } as { id: string; isAnonymous: boolean } | null,
    redirect: vi.fn((path: string) => {
        throw new Error(`NEXT_REDIRECT ${path}`)
    }),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/flags', () => ({ platformFlag: async () => mocks.platform }))
vi.mock('@/lib/auth/session/getServerSession', () => ({ getAuthUser: async () => mocks.user }))
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
        mocks.user = { id: 'user-1', isAnonymous: false }
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
        mocks.user = { id: 'anon-1', isAnonymous: true }
        await expect(requirePlatformAccess()).rejects.toThrow('NEXT_REDIRECT /')
    })

    it('sends a request without a session back to the board', async () => {
        mocks.user = null
        await expect(requirePlatformAccess()).rejects.toThrow('NEXT_REDIRECT /')
    })
})
