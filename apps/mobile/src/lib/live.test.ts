import { matchesSubscription, readSseEvents } from './live'

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }))
jest.mock('@/config/environment', () => ({ environment: { apiUrl: 'https://hub.test' } }))

describe('readSseEvents', () => {
    it('reads the complete events and keeps the rest for the next chunk', () => {
        expect(readSseEvents(':live\n\nevent: change\ndata: {"a":1}\n\n:\n\nevent: resync\ndata: \n\nevent: chan')).toEqual({
            events: [
                { event: 'change', data: '{"a":1}' },
                { event: 'resync', data: '' },
            ],
            rest: 'event: chan',
        })
    })
})

describe('matchesSubscription', () => {
    const update = { table: 'agents' as const, op: 'UPDATE' as const, row: { id: 'a1', workspace_id: 7 } }

    it('matches the table, the operations and the filter', () => {
        expect(matchesSubscription(update, { table: 'agents', filter: { workspace_id: 7 } })).toBe(true)
        expect(matchesSubscription(update, { table: 'agents', filter: { workspace_id: 8 } })).toBe(false)
        expect(matchesSubscription(update, { table: 'sessions' })).toBe(false)
        expect(matchesSubscription(update, { table: 'agents', ops: ['INSERT'] })).toBe(false)
    })

    it('lets a delete through when it lacks the filtered column', () => {
        expect(matchesSubscription({ table: 'sessions', op: 'DELETE', row: { id: 's1' } }, { table: 'sessions', filter: { agent_id: 'a1' } })).toBe(true)
    })
})
