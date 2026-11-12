import type { ChannelMessage } from '@lumvika/contracts'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/api/_actions/channels.actions', () => ({}))
vi.mock('@/app/api/_actions/members.actions', () => ({}))
vi.mock('@/stores/board.store', () => ({ useBoardStore: () => [] }))
vi.mock('@/supabase/useRealtimeSubscription', () => ({ useRealtimeSubscription: () => {} }))

const { isAnswering, messageFromRow, turnAsOf } = await import('./channel-rows')
const { mentionCandidates, mentionsIn, mentionTokensIn } = await import('./useChannelMentions')
const { personEntries } = await import('./picker-entries')
const { reconcile } = await import('./useChannelMessages')
const { channelHref } = await import('./useChannelRoute')

type ChannelDirectory = import('./useChannelDirectory').ChannelDirectory

function directory(): ChannelDirectory {
    const people = [
        { id: 'anna', name: 'Anna Schmidt', photo: null, email: 'anna.s@acme.test' },
        { id: 'anna2', name: 'Anna Weber', photo: null, email: 'anna.w@acme.test' },
        { id: 'ben', name: 'Ben', photo: null, email: 'ben@acme.test' },
    ]
    const coworkers = [
        { id: 'ada', name: 'Ada', handle: 'ada', reachable: true },
        { id: 'vault', name: 'Vault Keeper', handle: null, reachable: false },
    ]
    return {
        people,
        coworkers,
        person: id => people.find(person => person.id === id) ?? null,
        coworker: id => coworkers.find(coworker => coworker.id === id) ?? null,
        nameOf: () => null,
    }
}

function message(overrides: Partial<ChannelMessage> = {}): ChannelMessage & { thread: null } {
    return { id: 'm1', channelId: 'c1', author: { kind: 'user', userId: 'anna' }, body: 'hi', parentMessageId: null, mentions: [], editedAt: null, deletedAt: null, createdAt: '2026-11-01T00:00:00.000Z', thread: null, ...overrides }
}

describe('mentions in the composer', () => {
    it('labels people by first name, or by full name when two share it, and coworkers by handle', () => {
        const candidates = mentionCandidates(directory(), [{ kind: 'user', userId: 'anna' }, { kind: 'user', userId: 'anna2' }, { kind: 'user', userId: 'ben' }, { kind: 'agent', agentId: 'vault' }], 'Teammate')
        expect(candidates.map(candidate => candidate.label)).toEqual(['Anna-Schmidt', 'Anna-Weber', 'Ben', 'Vault-Keeper', 'ada'])
    })

    it('reads back the members a text mentions, as whole words only', () => {
        const candidates = mentionCandidates(directory(), [{ kind: 'user', userId: 'ben' }], 'Teammate')
        expect(mentionsIn('@Ben and @ada, see mail@ben.io', candidates)).toEqual([
            { kind: 'user', userId: 'ben' },
            { kind: 'agent', agentId: 'ada' },
        ])
        expect(mentionsIn('@Benjamin', candidates)).toEqual([])
    })

    it('draws a mention whatever case it was typed in', () => {
        const candidates = mentionCandidates(directory(), [], 'Teammate')
        const drawn = mentionTokensIn('hey @ADA and @ada, not mail@Ada', candidates).map(token => token.text)
        expect(drawn).toEqual(expect.arrayContaining(['@ada', '@ADA']))
        expect(drawn.filter(text => text.toLowerCase() === '@ada')).toHaveLength(2)
    })
})

describe('reconcile', () => {
    it('replaces the optimistic message with the one the server holds, whichever lands first', () => {
        const pending = { ...message({ id: 'pending-1', body: 'hello' }), clientId: 'pending-1', sendState: 'sending' as const }
        const landed = message({ id: 'm9', body: 'hello' })
        expect(reconcile([pending], landed)).toEqual([expect.objectContaining({ id: 'm9', clientId: undefined, sendState: undefined })])
        expect(reconcile([landed], landed)).toHaveLength(1)
        expect(reconcile([message({ id: 'm0', createdAt: '2026-11-02T00:00:00.000Z' })], landed).map(item => item.id)).toEqual(['m9', 'm0'])
    })
})

describe('realtime rows and routes', () => {
    it('hides the words of a deleted message and drops a mention that no longer parses', () => {
        const row = { id: 'm1', channel_id: 'c1', workspace_id: 1, author_user_id: null, author_agent_id: 'ada', body: 'secret', parent_message_id: null, mentions: [{ kind: 'agent', agentId: 'x' }, { nope: true }], edited_at: null, deleted_at: null, created_at: 'now', updated_at: 'now' }
        expect(messageFromRow(row)).toMatchObject({ author: { kind: 'agent', agentId: 'ada' }, mentions: [{ kind: 'agent', agentId: 'x' }] })
        expect(messageFromRow({ ...row, deleted_at: 'then' })).toMatchObject({ body: '', mentions: [] })
    })

    it('reads a turn its run never reported back on as timed out', () => {
        const turn = { id: 't', channelId: 'c', agentId: 'ada', threadMessageId: 'm', triggerMessageId: 'm', status: 'answering' as const, failure: null, replyMessageId: null, createdAt: new Date(Date.now() - 60_000).toISOString(), finishedAt: null }
        expect(isAnswering(turn)).toBe(true)
        expect(turnAsOf(turn)).toBe(turn)
        const stale = { ...turn, createdAt: new Date(Date.now() - 20 * 60_000).toISOString() }
        expect(isAnswering(stale)).toBe(false)
        expect(turnAsOf(stale)).toMatchObject({ status: 'failed', failure: 'timeout' })
    })

    it('tells apart two people who share a name by their email only', () => {
        const people = [...directory().people!, { id: 'anna3', name: 'Anna Weber', photo: null, email: 'weber@other.test' }]
        expect(personEntries(people, 'Teammate', 'ben').map(entry => [entry.name, entry.hint])).toEqual([
            ['Anna Schmidt', undefined],
            ['Anna Weber', 'anna.w@acme.test'],
            ['Anna Weber', 'weber@other.test'],
        ])
    })

    it('writes the side pane in the URL', () => {
        expect(channelHref('c1', { kind: 'thread', rootId: 'm1' })).toBe('/channels/c1?thread=m1')
        expect(channelHref('c1', { kind: 'details' })).toBe('/channels/c1?panel=details')
        expect(channelHref(null)).toBe('/channels')
    })
})
