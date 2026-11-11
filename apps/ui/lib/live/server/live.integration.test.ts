// Runs the live pipeline against a real Postgres: `pnpm db:start` first. Skipped when it is not reachable.
import { randomUUID } from 'node:crypto'

import { closeDb, getDb, insertRow, insertRows, LIVE_CHANNEL, openListenClient, serviceScope, updateRows, userScope } from '@lumvika/db'
import { authUsers } from '@lumvika/db/schema'
import { resetTestDatabase, testDatabaseReachable, testDatabaseUrl } from '@lumvika/db/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LiveChange } from '@/lib/live/protocol'

import { createLiveDispatcher } from './dispatch'
import { createLiveHub, type LiveEvent } from './hub'
import { startLiveListener, type LiveListener } from './listener'
import { parseLiveNotification } from './notification'

const reachable = await testDatabaseReachable()

async function createPerson(label: string) {
    const id = randomUUID()
    await getDb()
        .insert(authUsers)
        .values({ id, name: label, email: `${label}-${id}@example.com` })
    const service = serviceScope()
    const { data: workspace, error } = await insertRow(service, 'workspaces', { name: `${label}'s workspace` }, ['id'])
    if (error) throw new Error(error.message)
    await insertRows(service, 'users', { id, workspace_id: workspace.id })
    await insertRows(service, 'workspace_members', { user_id: id, workspace_id: workspace.id, role: 'admin' })
    return { id, workspaceId: workspace.id }
}

async function until(condition: () => boolean, timeoutMs = 5000) {
    const started = Date.now()
    while (!condition()) {
        if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the live change.')
        await new Promise(resolve => setTimeout(resolve, 20))
    }
}

describe.skipIf(!reachable)('live changes on Postgres', () => {
    let listener: LiveListener
    let runtime: typeof import('./runtime')
    const hub = createLiveHub()
    let opened = false

    beforeAll(async () => {
        await resetTestDatabase('lumvika_test_live')
        process.env.DATABASE_URL = testDatabaseUrl('lumvika_test_live')
        runtime = await import('./runtime')
        const dispatcher = createLiveDispatcher({ hub, readRowAs: runtime.readRowAs })
        listener = startLiveListener({
            channel: LIVE_CHANNEL,
            connect: () => openListenClient(testDatabaseUrl('lumvika_test_live')),
            onNotification: payload => {
                const notification = parseLiveNotification(payload)
                if (notification) dispatcher.dispatch(notification)
            },
            onOpen: () => {
                opened = true
            },
        })
        await until(() => opened)
    })

    afterAll(async () => {
        await listener?.stop()
        await closeDb()
    })

    it("brings an update of a workspace's agent to its member and to nobody else", async () => {
        const alice = await createPerson('alice')
        const bob = await createPerson('bob')
        const { data: space } = await insertRow(serviceScope(), 'spaces', { workspace_id: alice.workspaceId, col_start: 0, row_start: 0, col_end: 2, row_end: 2 }, ['id'])
        const { data: agent } = await insertRow(serviceScope(), 'agents', { workspace_id: alice.workspaceId, space_id: space!.id, name: 'Before' }, ['id'])

        expect(await runtime.memberWorkspaces(bob.id)).toEqual([bob.workspaceId])
        const received = (events: LiveEvent[]) => events.flatMap(event => (event.kind === 'change' && event.change.table === 'agents' ? [event.change] : []))
        const aliceEvents: LiveEvent[] = []
        const bobEvents: LiveEvent[] = []
        // Bob's stream as it opens (his memberships), and one that claims Alice's workspace anyway:
        // row level security still keeps the agent from him.
        const bobForged: LiveEvent[] = []
        hub.add(alice.id, (await runtime.memberWorkspaces(alice.id))!, event => aliceEvents.push(event))
        hub.add(bob.id, (await runtime.memberWorkspaces(bob.id))!, event => bobEvents.push(event))
        hub.add(bob.id, [alice.workspaceId], event => bobForged.push(event))

        // Written as Alice, the way the app writes: the trigger fires under her role too.
        const { error } = await updateRows(userScope(alice.id), 'agents', { name: 'After' }, { id: agent!.id })
        expect(error).toBeNull()
        await until(() => received(aliceEvents).some(change => change.op === 'UPDATE'))
        // The insert above may still be on its way: give both a moment, then look at everything Bob got.
        await new Promise(resolve => setTimeout(resolve, 300))

        const update = received(aliceEvents).find(change => change.op === 'UPDATE') as LiveChange
        expect(update.row).toMatchObject({ id: agent!.id, name: 'After', workspace_id: alice.workspaceId })
        expect(typeof update.row.created_at).toBe('string')
        expect(received(bobEvents)).toEqual([])
        expect(received(bobForged)).toEqual([])
    })
})
