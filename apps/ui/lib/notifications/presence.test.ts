import { describe, expect, it } from 'vitest'
import { PRESENCE_HEARTBEAT_MS, PRESENCE_IDLE_MS, PRESENCE_TTL_MS, isPresent, shouldBeat, splitByPresence } from './presence'

const NOW = new Date('2026-09-04T12:00:00.000Z')

function secondsBefore(count: number): string {
    return new Date(NOW.getTime() - count * 1000).toISOString()
}

describe('isPresent', () => {
    it('treats a user with no row as away', () => {
        expect(isPresent(null, NOW)).toBe(false)
        expect(isPresent(undefined, NOW)).toBe(false)
    })

    it('trusts a fresh beat', () => {
        expect(isPresent(secondsBefore(10), NOW)).toBe(true)
    })

    it('expires exactly at the ttl', () => {
        expect(isPresent(new Date(NOW.getTime() - PRESENCE_TTL_MS + 1).toISOString(), NOW)).toBe(true)
        expect(isPresent(new Date(NOW.getTime() - PRESENCE_TTL_MS).toISOString(), NOW)).toBe(false)
    })

    it('reads a timestamp in the future as clock skew, not as an absence', () => {
        expect(isPresent(new Date(NOW.getTime() + 5000).toISOString(), NOW)).toBe(true)
    })

    it('keeps a window wide enough that a lost beat does not read as away', () => {
        expect(PRESENCE_TTL_MS).toBeGreaterThan(2 * PRESENCE_HEARTBEAT_MS)
    })
})

describe('splitByPresence', () => {
    const recipients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    it('separates the fresh beat from the stale one and the missing one', () => {
        const rows = [
            { user_id: 'a', last_seen_at: secondsBefore(5) },
            { user_id: 'b', last_seen_at: secondsBefore(600) },
        ]
        const { present, away } = splitByPresence(recipients, rows, NOW)
        expect(present.map(r => r.id)).toEqual(['a'])
        expect(away.map(r => r.id)).toEqual(['b', 'c'])
    })

    it('sends to everyone when the presence lookup came back empty', () => {
        const { present, away } = splitByPresence(recipients, [], NOW)
        expect(present).toEqual([])
        expect(away).toHaveLength(3)
    })

    it('ignores a presence row for someone who is not a recipient', () => {
        const { present } = splitByPresence(recipients, [{ user_id: 'z', last_seen_at: secondsBefore(1) }], NOW)
        expect(present).toEqual([])
    })
})

describe('shouldBeat', () => {
    const now = NOW.getTime()

    it('never beats from a hidden tab', () => {
        expect(shouldBeat({ visible: false, lastInteractionAt: now, now })).toBe(false)
    })

    it('beats while the person is still touching the app', () => {
        expect(shouldBeat({ visible: true, lastInteractionAt: now - 60_000, now })).toBe(true)
    })

    it('stops beating for a visible tab nobody has touched', () => {
        expect(shouldBeat({ visible: true, lastInteractionAt: now - PRESENCE_IDLE_MS, now })).toBe(false)
        expect(shouldBeat({ visible: true, lastInteractionAt: now - 6 * 60_000, now })).toBe(false)
    })
})
