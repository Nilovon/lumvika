import { describe, expect, it, vi } from 'vitest'

import type { LiveChange } from '@/lib/live/protocol'

import { createLiveDispatcher, type ReadRowAs } from './dispatch'
import { createLiveHub, type LiveEvent } from './hub'
import type { RowNotification } from './notification'

function setup(readRowAs: ReadRowAs) {
    const hub = createLiveHub()
    const dispatcher = createLiveDispatcher({ hub, readRowAs, onError: error => { throw error } })
    const open = (userId: string, workspaces: number[]) => {
        const events: LiveEvent[] = []
        const subscriber = hub.add(userId, workspaces, event => events.push(event))
        return { events, subscriber, changes: () => events.flatMap(event => (event.kind === 'change' ? [event.change] : [])) }
    }
    return { hub, dispatcher, open }
}

const agentUpdate: RowNotification = { kind: 'row', table: 'agents', op: 'UPDATE', workspace_id: 1, user_id: null, key: { id: 'a1' } }

describe('live dispatcher', () => {
    it('sends a changed row to each member as row level security shows it to them', async () => {
        const readRowAs = vi.fn<ReadRowAs>(async userId => (userId === 'alice' ? { id: 'a1', name: 'Seen by alice' } : null))
        const { dispatcher, open } = setup(readRowAs)
        const alice = open('alice', [1])
        const aliceOtherTab = open('alice', [1])
        const bob = open('bob', [1])
        const outsider = open('carol', [2])

        dispatcher.dispatch(agentUpdate)
        await dispatcher.idle()

        const expected: LiveChange = { table: 'agents', op: 'UPDATE', row: { id: 'a1', name: 'Seen by alice' } }
        expect(alice.changes()).toEqual([expected])
        expect(aliceOtherTab.changes()).toEqual([expected])
        expect(bob.changes()).toEqual([])
        expect(outsider.changes()).toEqual([])
        expect(readRowAs.mock.calls.map(([userId]) => userId).sort()).toEqual(['alice', 'bob'])
    })

    it('sends a delete without reading, to the workspace and the user it names only', async () => {
        const readRowAs = vi.fn<ReadRowAs>()
        const { dispatcher, open } = setup(readRowAs)
        const member = open('alice', [3])
        const owner = open('bob', [])
        const outsider = open('carol', [4])

        dispatcher.dispatch({ kind: 'row', table: 'space_members', op: 'DELETE', workspace_id: 3, user_id: 'bob', key: { space_id: 's1', user_id: 'bob' }, old: { space_id: 's1', user_id: 'bob', workspace_id: 3 } })
        await dispatcher.idle()

        const expected = { table: 'space_members', op: 'DELETE', row: { space_id: 's1', user_id: 'bob', workspace_id: 3 } }
        expect(member.changes()).toEqual([expected])
        expect(owner.changes()).toEqual([expected])
        expect(outsider.changes()).toEqual([])
        expect(readRowAs).not.toHaveBeenCalled()
    })

    it("keeps a user's changes in the order they were committed", async () => {
        let release: () => void = () => undefined
        const readRowAs = vi.fn<ReadRowAs>(() => new Promise(resolve => (release = () => resolve({ id: 'a1', status: 'stale' }))))
        const { dispatcher, open } = setup(readRowAs)
        const alice = open('alice', [1])

        dispatcher.dispatch(agentUpdate)
        dispatcher.dispatch({ kind: 'row', table: 'agents', op: 'DELETE', workspace_id: 1, user_id: null, key: { id: 'a1' }, old: { id: 'a1', workspace_id: 1 } })
        await Promise.resolve()
        release()
        await dispatcher.idle()

        expect(alice.changes().map(change => change.op)).toEqual(['UPDATE', 'DELETE'])
    })

    it("opens a new workspace's changes to a user who just joined it, and closes them when they leave", async () => {
        const { hub, dispatcher, open } = setup(async () => ({ user_id: 'alice', workspace_id: 9, role: 'member' }))
        const alice = open('alice', [1])

        dispatcher.dispatch({ kind: 'row', table: 'workspace_members', op: 'INSERT', workspace_id: 9, user_id: 'alice', key: { user_id: 'alice', workspace_id: 9 } })
        await dispatcher.idle()
        expect(alice.changes()).toHaveLength(1)
        expect(hub.audience({ workspaceId: 9 })).toEqual(new Set([alice.subscriber]))

        dispatcher.dispatch({ kind: 'row', table: 'workspace_members', op: 'DELETE', workspace_id: 9, user_id: 'alice', key: { user_id: 'alice', workspace_id: 9 }, old: { user_id: 'alice', workspace_id: 9 } })
        await dispatcher.idle()
        expect(alice.changes()).toHaveLength(2)
        expect(hub.audience({ workspaceId: 9 })).toEqual(new Set())
    })

    it("sends a broadcast to the workspace's other members", () => {
        const { dispatcher, open } = setup(vi.fn())
        const sender = open('alice', [1])
        const member = open('bob', [1])
        const outsider = open('carol', [2])

        dispatcher.dispatch({ kind: 'broadcast', workspace_id: 1, from: 'alice', event: 'cursor', payload: { userId: 'alice', x: 1, y: 2 } })

        expect(member.events).toEqual([{ kind: 'broadcast', broadcast: { workspaceId: 1, event: 'cursor', payload: { userId: 'alice', x: 1, y: 2 } } }])
        expect(sender.events).toEqual([])
        expect(outsider.events).toEqual([])
    })
})
