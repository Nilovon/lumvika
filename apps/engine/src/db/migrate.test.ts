import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'lumvika-migrate-'))
process.env.LUMVIKA_DATA_DIR = dataDir

const { describe, expect, it } = await import('vitest')
const { raw } = await import('./client.js')
const { migrate } = await import('./migrate.js')
const { getSystemDb, migrateSystemDb, systemDbExists } = await import('./systemDb.js')
const { systemDbPath } = await import('../config/paths.js')

describe('migrate (central)', () => {
    it('drops moved tables and keeps agents', async () => {
        await raw().executeMultiple(`
CREATE TABLE sessions (id TEXT PRIMARY KEY);
CREATE TABLE messages (id TEXT PRIMARY KEY);
CREATE TABLE runs (id TEXT PRIMARY KEY);
CREATE TABLE memories (id TEXT PRIMARY KEY);
`)
        await migrate()
        const res = await raw().execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        const tables = res.rows.map(r => String(r.name))
        expect(tables).toContain('agents')
        expect(tables).not.toContain('sessions')
        expect(tables).not.toContain('messages')
        expect(tables).not.toContain('runs')
        expect(tables).not.toContain('memories')
        await migrate()
    })
})

describe('system db migration', () => {
    it('creates the per-agent db with all tables and is idempotent', async () => {
        expect(systemDbExists('agent-x')).toBe(false)
        const { client } = await getSystemDb('agent-x')
        await migrateSystemDb(client, systemDbPath('agent-x'))
        expect(existsSync(systemDbPath('agent-x'))).toBe(true)
        const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        const tables = res.rows.map(r => String(r.name))
        for (const table of ['sessions', 'messages', 'messages_fts', 'runs', 'memories', 'memories_fts']) {
            expect(tables).toContain(table)
        }
        const info = await client.execute('PRAGMA table_info(sessions)')
        const columns = info.rows.map(r => String(r.name))
        expect(columns).toContain('origin_agent_id')
        expect(columns).toContain('origin_session_id')
    })
})
