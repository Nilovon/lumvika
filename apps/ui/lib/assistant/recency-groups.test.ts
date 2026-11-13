import type { AssistantChat } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { groupByRecency, matchesQuery, recencyGroupOf } from './recency-groups'

const now = new Date(2026, 10, 12, 15, 0)

function chat(id: string, at: Date | null, title = id): AssistantChat {
    return { id, userId: 'me', projectId: null, title, engineSessionId: null, model: null, shared: false, lastMessageAt: at?.toISOString() ?? null, archivedAt: null, createdAt: new Date(2026, 0, 1).toISOString(), updatedAt: now.toISOString() }
}

describe('recencyGroupOf', () => {
    it('cuts on calendar days, not on 24 hour windows', () => {
        expect(recencyGroupOf(new Date(2026, 10, 12, 0, 5).toISOString(), now)).toBe('today')
        expect(recencyGroupOf(new Date(2026, 10, 11, 23, 59).toISOString(), now)).toBe('yesterday')
        expect(recencyGroupOf(new Date(2026, 10, 6).toISOString(), now)).toBe('previous7')
        expect(recencyGroupOf(new Date(2026, 10, 5).toISOString(), now)).toBe('previous30')
        expect(recencyGroupOf(new Date(2026, 9, 1).toISOString(), now)).toBe('older')
    })
})

describe('groupByRecency', () => {
    it('orders the chats newest first and leaves out the empty groups', () => {
        const groups = groupByRecency([chat('old', new Date(2026, 5, 1)), chat('a', new Date(2026, 10, 12, 9)), chat('b', new Date(2026, 10, 12, 14)), chat('never', null)], now)
        expect(groups.map(group => [group.group, group.chats.map(c => c.id)])).toEqual([
            ['today', ['b', 'a']],
            ['older', ['old', 'never']],
        ])
    })
})

describe('matchesQuery', () => {
    it('matches the title regardless of case, and everything on an empty query', () => {
        expect(matchesQuery(chat('1', now, 'Pricing Ideas'), 'pricing')).toBe(true)
        expect(matchesQuery(chat('1', now, 'Pricing Ideas'), 'lunch')).toBe(false)
        expect(matchesQuery(chat('1', now, 'Anything'), '  ')).toBe(true)
    })
})
