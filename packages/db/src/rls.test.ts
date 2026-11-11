import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { selectMany, selectMaybeSingle, selectSingle } from './helpers'
import { closeDb, getDb } from './pool'
import { anonScope, serviceScope, userScope } from './scope'
import { authUsers } from './schema'
import { insertRow, insertRows } from './writes'

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

describe('row level security', () => {
    let alice: Awaited<ReturnType<typeof createPerson>>
    let bob: Awaited<ReturnType<typeof createPerson>>

    beforeAll(async () => {
        alice = await createPerson('alice')
        bob = await createPerson('bob')
    })

    afterAll(closeDb)

    it('shows a user their own row and nobody else', async () => {
        const { data, error } = await selectMany(userScope(alice.id), 'users', ['id'], {})
        expect(error).toBeNull()
        expect(data).toEqual([{ id: alice.id }])
    })

    it('shows a visitor without a session no user at all', async () => {
        const { data, error } = await selectMany(anonScope(), 'users', ['id'], {})
        expect(data).toBeNull()
        expect(error?.code).toBe('42501')
    })

    it('shows the service every user', async () => {
        const { data } = await selectMany(serviceScope(), 'users', ['id'], { id: [alice.id, bob.id] })
        expect(data).toHaveLength(2)
    })

    it('keeps one workspace membership away from another member', async () => {
        const { data } = await selectMaybeSingle(userScope(bob.id), 'workspace_members', ['user_id'], { user_id: alice.id, workspace_id: alice.workspaceId })
        expect(data).toBeNull()
    })

    it('answers an error when a single row is not there', async () => {
        const { data, error } = await selectSingle(userScope(bob.id), 'workspaces', ['id'], { id: alice.workspaceId })
        expect(data).toBeNull()
        expect(error?.code).toBe('NOT_ONE_ROW')
    })

    it('leaves neither the role nor the user on a pooled connection', async () => {
        await Promise.all(Array.from({ length: 20 }, () => selectMany(userScope(alice.id), 'users', ['id'], {})))
        const rows = await Promise.all(Array.from({ length: 20 }, () => getDb().execute<{ role: string; user_id: string | null }>(sql`select current_user as role, nullif(current_setting('lumvika.user_id', true), '') as user_id`)))
        for (const {
            rows: [row],
        } of rows) {
            expect(row.role).not.toBe('authenticated')
            expect(row.user_id).toBeNull()
        }
    })

    it('holds every public table to row level security', async () => {
        const { rows } = await getDb().execute<{ table: string }>(sql`
            select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`)
        expect(rows.map(row => row.table)).toEqual([])
    })
})

describe('raw SQL', () => {
    afterAll(closeDb)

    it('answers int8 as numbers and timestamps in ISO 8601', async () => {
        const { queryRows } = await import('./functions')
        const { data } = await queryRows<{ big: number; at: string }>(serviceScope(), sql`select 42::int8 as big, '2026-11-11 10:00:00.123456+00'::timestamptz as at`)
        expect(data).toEqual([{ big: 42, at: '2026-11-11T10:00:00.123456+00:00' }])
    })
})

describe('SQL functions', () => {
    afterAll(closeDb)

    it('passes a JS array as one Postgres array', async () => {
        const { callScalar } = await import('./functions')
        const { data, error } = await callScalar<boolean>(serviceScope(), 'claim_app_quota', { p_scope: 'test', p_action: 'probe', p_periods: ['day:1', 'month:1'], p_maxes: [5, 50] })
        expect(error).toBeNull()
        expect(data).toBe(true)
    })
})
