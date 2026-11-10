import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-agentdb-'))
process.env.RERUN_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { agentDbExists, checkpointAgentDb, closeAgentDb, getAgentDb, listAgentDbTables, readAgentDbSchema } = await import('./agentDb.js')
const { agentDataDbPath, agentDataDir } = await import('../config/paths.js')

describe('agent db without a file', () => {
    it('answers empty and never creates the file', async () => {
        expect(agentDbExists('empty')).toBe(false)
        expect(await listAgentDbTables('empty')).toEqual([])
        expect(await readAgentDbSchema('empty')).toBe('')
        await checkpointAgentDb('empty')

        expect(agentDbExists('empty')).toBe(false)
        expect(existsSync(agentDataDir('empty'))).toBe(false)
    })
})

describe('agent db with a file', () => {
    it('lists the tables and prints their schema', async () => {
        const client = await getAgentDb('filled')
        await client.execute('CREATE TABLE leads (id INTEGER PRIMARY KEY, email TEXT NOT NULL)')

        expect(agentDbExists('filled')).toBe(true)
        expect(existsSync(agentDataDbPath('filled'))).toBe(true)
        const tables = await listAgentDbTables('filled')
        expect(tables.map(table => table.name)).toEqual(['leads'])
        expect(tables[0].columns.map(column => column.name)).toEqual(['id', 'email'])
        const schema = await readAgentDbSchema('filled')
        expect(schema).toContain('leads')
        expect(schema).toContain('email')
    })

    it('reuses the pooled client until it is closed', async () => {
        const first = await getAgentDb('pooled')
        expect(await getAgentDb('pooled')).toBe(first)
        closeAgentDb('pooled')
        expect(await getAgentDb('pooled')).not.toBe(first)
    })

    it('folds the WAL back into the file on checkpoint', async () => {
        const client = await getAgentDb('wal')
        await client.execute('CREATE TABLE notes (body TEXT)')
        await client.execute("INSERT INTO notes VALUES ('hello')")

        await checkpointAgentDb('wal')

        const wal = await client.execute('PRAGMA wal_checkpoint(PASSIVE)')
        expect(Number(wal.rows[0][1])).toBe(0)
    })

    it('swallows a checkpoint on a closed client', async () => {
        const client = await getAgentDb('closed')
        client.close()
        await expect(checkpointAgentDb('closed')).resolves.toBeUndefined()
    })
})
