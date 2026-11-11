import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { callColumn } from './functions'
import { selectMany, selectSingle } from './helpers'
import { closeDb, getDb } from './pool'
import type { DbResult } from './result'
import { serviceScope, userScope } from './scope'
import { authUsers } from './schema'
import { deleteRows, insertRow, insertRows, updateRows } from './writes'

// The access by Box, seen from an admin and from members with each scope. Open: open to the
// workspace. Closed: restricted, nobody named. Shared: restricted, the `all` member named with
// `use`. Managed: open, the `assigned` member named with `manage`.
const service = serviceScope()

async function expectOk<T>(result: Promise<DbResult<T>>): Promise<T> {
    const settled = await result
    if (settled.error) throw new Error(settled.error.message)
    return settled.data
}

async function createUser(label: string) {
    const id = randomUUID()
    await getDb()
        .insert(authUsers)
        .values({ id, name: label, email: `${label}-${id}@example.com` })
    return id
}

describe('access by Box', () => {
    let workspaceId: number
    let admin: string
    let member: string
    let assigned: string
    const space: Record<'open' | 'closed' | 'shared' | 'managed', string> = { open: randomUUID(), closed: randomUUID(), shared: randomUUID(), managed: randomUUID() }
    const agent = { open: randomUUID(), closed: randomUUID(), shared: randomUUID(), managed: randomUUID() }
    const openSession = `open-${randomUUID()}`
    const closedSession = `closed-${randomUUID()}`

    const names = (rows: { name: string | null }[] | null) => (rows ?? []).map(row => row.name).sort()
    const agentCol = async (id: string) => (await expectOk(selectSingle(service, 'agents', ['col'], { id }))).col
    const spaceName = async (id: string) => (await expectOk(selectSingle(service, 'spaces', ['name'], { id }))).name

    beforeAll(async () => {
        admin = await createUser('box-admin')
        member = await createUser('box-member')
        assigned = await createUser('box-assigned')
        workspaceId = (await expectOk(insertRow(service, 'workspaces', { name: 'Access by Box' }, ['id']))).id
        await expectOk(insertRows(service, 'users', [admin, member, assigned].map(id => ({ id, workspace_id: workspaceId }))))
        await expectOk(
            insertRows(service, 'workspace_members', [
                { user_id: admin, workspace_id: workspaceId, role: 'admin', box_scope: 'all' },
                { user_id: member, workspace_id: workspaceId, role: 'member', box_scope: 'all' },
                { user_id: assigned, workspace_id: workspaceId, role: 'member', box_scope: 'assigned' },
            ]),
        )
        await expectOk(
            insertRows(service, 'spaces', [
                { id: space.open, workspace_id: workspaceId, name: 'Open', col_start: 0, row_start: 0, col_end: 3, row_end: 3, visibility: 'workspace' },
                { id: space.closed, workspace_id: workspaceId, name: 'Closed', col_start: 4, row_start: 0, col_end: 7, row_end: 3, visibility: 'restricted' },
                { id: space.shared, workspace_id: workspaceId, name: 'Shared', col_start: 8, row_start: 0, col_end: 11, row_end: 3, visibility: 'restricted' },
                { id: space.managed, workspace_id: workspaceId, name: 'Managed', col_start: 12, row_start: 0, col_end: 15, row_end: 3, visibility: 'workspace' },
            ]),
        )
        await expectOk(
            insertRows(service, 'space_members', [
                { space_id: space.shared, user_id: member, workspace_id: workspaceId, access: 'use' },
                { space_id: space.managed, user_id: assigned, workspace_id: workspaceId, access: 'manage' },
            ]),
        )
        await expectOk(
            insertRows(service, 'agents', [
                { id: agent.open, workspace_id: workspaceId, space_id: space.open, name: 'open-agent', col: 1, row: 1 },
                { id: agent.closed, workspace_id: workspaceId, space_id: space.closed, name: 'closed-agent', col: 1, row: 1 },
                { id: agent.shared, workspace_id: workspaceId, space_id: space.shared, name: 'shared-agent', col: 1, row: 1 },
                { id: agent.managed, workspace_id: workspaceId, space_id: space.managed, name: 'managed-agent', col: 1, row: 1 },
            ]),
        )
        await expectOk(
            insertRows(service, 'sessions', [
                { agent_id: agent.open, engine_session_id: openSession },
                { agent_id: agent.closed, engine_session_id: closedSession },
            ]),
        )
        await expectOk(
            insertRows(service, 'notifications', [
                { workspace_id: workspaceId, agent_id: agent.open, space_id: space.open, message: 'open' },
                { workspace_id: workspaceId, agent_id: agent.closed, space_id: space.closed, message: 'closed' },
                { workspace_id: workspaceId, agent_id: null, space_id: null, message: 'workspace-wide' },
            ]),
        )
        await expectOk(insertRows(service, 'message_feedback', { workspace_id: workspaceId, agent_id: agent.closed, message_id: `closed-vote-${randomUUID()}`, rating: 'down', message_text: 'closed transcript' }))
    })

    afterAll(closeDb)

    describe('an admin', () => {
        it('sees every Box, every coworker and every access row', async () => {
            const scope = userScope(admin)
            expect((await selectMany(scope, 'spaces', ['id'], { workspace_id: workspaceId })).data).toHaveLength(4)
            expect((await selectMany(scope, 'agents', ['id'], { workspace_id: workspaceId })).data).toHaveLength(4)
            expect((await selectMany(scope, 'space_members', ['space_id'], { workspace_id: workspaceId })).data).toHaveLength(2)
        })

        it('manages every Box', async () => {
            const { data } = await callColumn<string>(userScope(admin), 'manageable_space_ids')
            expect(data?.filter(id => Object.values(space).includes(id)).sort()).toEqual(Object.values(space).sort())
        })

        it('cannot read the message feedback', async () => {
            const { error } = await selectMany(userScope(admin), 'message_feedback', ['id'], { workspace_id: workspaceId })
            expect(error?.code).toBe('42501')
        })
    })

    describe('a member scoped to all', () => {
        it('sees the open Boxes and the one named to them, never the closed one', async () => {
            const scope = userScope(member)
            expect(names((await selectMany(scope, 'spaces', ['name'], { workspace_id: workspaceId })).data)).toEqual(['Managed', 'Open', 'Shared'])
            expect(names((await selectMany(scope, 'agents', ['name'], { workspace_id: workspaceId })).data)).toEqual(['managed-agent', 'open-agent', 'shared-agent'])
        })

        it('sees the sessions of the coworkers they see, and only those', async () => {
            const scope = userScope(member)
            expect((await selectMany(scope, 'sessions', ['id'], { engine_session_id: closedSession })).data).toHaveLength(0)
            expect((await selectMany(scope, 'sessions', ['id'], { engine_session_id: openSession })).data).toHaveLength(1)
        })

        it('gets the notifications of visible coworkers and the workspace-wide ones', async () => {
            const { data } = await selectMany(userScope(member), 'notifications', ['message'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.message).sort()).toEqual(['open', 'workspace-wide'])
        })

        it('reads only their own access rows', async () => {
            const { data } = await selectMany(userScope(member), 'space_members', ['user_id'], { workspace_id: workspaceId })
            expect(data).toEqual([{ user_id: member }])
        })

        it('cannot read the votes, nor the transcripts they copy', async () => {
            const { error } = await selectMany(userScope(member), 'message_feedback', ['message_text'], { workspace_id: workspaceId })
            expect(error?.code).toBe('42501')
        })

        it('cannot rename an open Box, move or delete a coworker with `use`', async () => {
            const scope = userScope(member)
            await updateRows(scope, 'spaces', { name: 'Renamed' }, { id: space.open })
            await updateRows(scope, 'agents', { col: 2 }, { id: agent.open })
            await deleteRows(scope, 'agents', { id: agent.shared })
            expect(await spaceName(space.open)).toBe('Open')
            expect(await agentCol(agent.open)).toBe(1)
            expect((await selectMany(service, 'agents', ['id'], { id: agent.shared })).data).toHaveLength(1)
        })

        it('cannot create a coworker in a Box they only use', async () => {
            const { error } = await insertRows(userScope(member), 'agents', { workspace_id: workspaceId, space_id: space.open, name: 'sneaky' })
            expect(error?.code).toBe('42501')
        })

        it('cannot grant themselves access', async () => {
            const { error } = await insertRows(userScope(member), 'space_members', { space_id: space.closed, user_id: member, workspace_id: workspaceId, access: 'manage' })
            expect(error?.code).toBe('42501')
        })

        it('cannot promote themselves', async () => {
            await updateRows(userScope(member), 'workspace_members', { role: 'admin' }, { user_id: member, workspace_id: workspaceId })
            const { data } = await selectSingle(service, 'workspace_members', ['role'], { user_id: member, workspace_id: workspaceId })
            expect(data?.role).toBe('member')
        })
    })

    describe('a member scoped to assigned', () => {
        it('sees only the Box named to them and its coworkers', async () => {
            const scope = userScope(assigned)
            expect(names((await selectMany(scope, 'spaces', ['name'], { workspace_id: workspaceId })).data)).toEqual(['Managed'])
            expect(names((await selectMany(scope, 'agents', ['name'], { workspace_id: workspaceId })).data)).toEqual(['managed-agent'])
        })

        it('gets no notification of a hidden coworker', async () => {
            const { data } = await selectMany(userScope(assigned), 'notifications', ['message'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.message)).toEqual(['workspace-wide'])
        })

        it('renames their Box, moves and creates coworkers inside it', async () => {
            const scope = userScope(assigned)
            await expectOk(updateRows(scope, 'spaces', { name: 'Mine' }, { id: space.managed }))
            await expectOk(updateRows(scope, 'agents', { col: 5 }, { id: agent.managed }))
            await expectOk(insertRows(scope, 'agents', { workspace_id: workspaceId, space_id: space.managed, name: 'made-by-manager' }))
            expect(await spaceName(space.managed)).toBe('Mine')
            expect(await agentCol(agent.managed)).toBe(5)
        })

        it('cannot move a coworker into a Box they do not manage', async () => {
            const { error } = await updateRows(userScope(assigned), 'agents', { space_id: space.open }, { id: agent.managed })
            expect(error?.code).toBe('42501')
        })
    })

    describe('the access rows', () => {
        it('leave with the member who leaves the workspace', async () => {
            await expectOk(deleteRows(service, 'workspace_members', { user_id: member, workspace_id: workspaceId }))
            expect((await selectMany(service, 'space_members', ['space_id'], { user_id: member })).data).toHaveLength(0)
        })

        it('leave with the Box that is deleted', async () => {
            await expectOk(deleteRows(service, 'agents', { space_id: space.managed }))
            await expectOk(deleteRows(service, 'spaces', { id: space.managed }))
            expect((await selectMany(service, 'space_members', ['user_id'], { space_id: space.managed })).data).toHaveLength(0)
        })

        it('leave a new Box open to the workspace by default', async () => {
            const { visibility } = await expectOk(insertRow(service, 'spaces', { workspace_id: workspaceId, name: 'Default', col_start: 20, row_start: 0, col_end: 23, row_end: 3 }, ['visibility']))
            expect(visibility).toBe('workspace')
        })
    })
})
