import { describe, expect, it } from 'vitest'

import { PUSH_SOURCE_LIMIT, PUSH_USER_LIMIT, pushAllowed, pushWindowStart } from './push-limits'

describe('push limits', () => {
    it('lets a push through under both caps, and drops it at either', () => {
        expect(pushAllowed({ sourceCount: 0, userCount: 0 })).toBe(true)
        expect(pushAllowed({ sourceCount: PUSH_SOURCE_LIMIT, userCount: 0 })).toBe(false)
        expect(pushAllowed({ sourceCount: 0, userCount: PUSH_USER_LIMIT })).toBe(false)
    })

    it('counts over the last hour', () => {
        expect(pushWindowStart(new Date('2026-10-21T12:00:00Z')).toISOString()).toBe('2026-10-21T11:00:00.000Z')
    })
})
