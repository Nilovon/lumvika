import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-shareddb-'))

const { describe, expect, it } = await import('vitest')
const { getSharedDb, readSharedDbSchema, recordTableOwnership, sharedDbExists, SHARED_HIDDEN_TABLES } = await import('./sharedDb.js')
const { executeStore, listTables } = await import('./sqlStore.js')

describe('shared database', () => {
    it('is a single client for the whole process', async () => {
        expect(await getSharedDb()).toBe(await getSharedDb())
        expect(sharedDbExists()).toBe(true)
    })

    it('hides its own bookkeeping table', async () => {
        const client = await getSharedDb()
        const names = (await listTables(client, SHARED_HIDDEN_TABLES)).map(t => t.name)
        expect(names).not.toContain('_rerun_shared_tables')
    })

    it('remembers which agent created a table', async () => {
        const client = await getSharedDb()
        await executeStore(client, { sql: 'CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, email TEXT)', params: [] })
        await recordTableOwnership(client, ['CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, email TEXT)'], 'alice')
        expect(await readSharedDbSchema()).toContain('leads(id INTEGER PK, email TEXT) created by alice')
    })

    it('keeps the first creator when another agent re-runs the same CREATE', async () => {
        const client = await getSharedDb()
        await recordTableOwnership(client, ['CREATE TABLE IF NOT EXISTS leads (id INTEGER)'], 'bob')
        expect(await readSharedDbSchema()).toContain('created by alice')
    })

    it('reads a quoted table name and follows a rename', async () => {
        const client = await getSharedDb()
        await executeStore(client, { sql: 'CREATE TABLE "odd name" (x TEXT)', params: [] })
        await recordTableOwnership(client, ['CREATE TABLE "odd name" (x TEXT)'], 'carol')
        expect(await readSharedDbSchema()).toContain('odd name(x TEXT) created by carol')

        await executeStore(client, { sql: 'ALTER TABLE "odd name" RENAME TO renamed', params: [] })
        await recordTableOwnership(client, ['ALTER TABLE "odd name" RENAME TO renamed'], 'carol')
        expect(await readSharedDbSchema()).toContain('renamed(x TEXT) created by carol')
    })

    it('forgets a dropped table', async () => {
        const client = await getSharedDb()
        await executeStore(client, { sql: 'DROP TABLE renamed', params: [] })
        await recordTableOwnership(client, ['DROP TABLE renamed'], 'carol')
        expect(await readSharedDbSchema()).not.toContain('renamed')
    })

    it('never lets a bookkeeping failure break the statement that triggered it', async () => {
        const client = await getSharedDb()
        await expect(recordTableOwnership(client, ['CREATE TABLE'], 'dave')).resolves.toBeUndefined()
        await expect(recordTableOwnership(client, ["SELECT 'CREATE TABLE ghosts' AS note"], 'dave')).resolves.toBeUndefined()
    })

    it('caps the schema it hands to the prompt and says what it left out', async () => {
        const client = await getSharedDb()
        for (let i = 0; i < 6; i++) await executeStore(client, { sql: `CREATE TABLE IF NOT EXISTS bulk_${i} (x TEXT)`, params: [] })
        const capped = await readSharedDbSchema({ maxTables: 3, more: n => `... and ${n} more tables` })
        expect(capped.split('\n')).toHaveLength(4)
        expect(capped).toMatch(/and \d+ more tables/)
    })
})
