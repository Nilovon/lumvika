import { describe, expect, it, vi } from 'vitest'

import { createBroadcastGuard } from './broadcast-guard'

describe('broadcast guard', () => {
    it('reads a membership once in a while, not on every move', async () => {
        let now = 0
        const isMember = vi.fn(async (_userId: string, workspaceId: number) => workspaceId === 1)
        const guard = createBroadcastGuard({ isMember, membershipTtlMs: 1000, now: () => now })

        expect(await guard.check('alice', 1)).toBe('allowed')
        expect(await guard.check('alice', 2)).toBe('forbidden')
        now = 500
        expect(await guard.check('alice', 1)).toBe('allowed')
        expect(isMember).toHaveBeenCalledTimes(2)
        now = 1500
        await guard.check('alice', 1)
        expect(isMember).toHaveBeenCalledTimes(3)
    })

    it('refuses a sender past its budget for the rest of the second', async () => {
        let now = 0
        const guard = createBroadcastGuard({ isMember: async () => true, perSecond: 2, now: () => now })
        expect(await guard.check('alice', 1)).toBe('allowed')
        expect(await guard.check('alice', 1)).toBe('allowed')
        expect(await guard.check('alice', 1)).toBe('limited')
        expect(await guard.check('bob', 1)).toBe('allowed')
        now = 1000
        expect(await guard.check('alice', 1)).toBe('allowed')
    })
})
