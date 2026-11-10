import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-data-sql-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it, beforeAll } = await import('vitest')
const { createServer } = await import('../server.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { mkdir } = await import('node:fs/promises')
const { agentDir } = await import('../../config/paths.js')

const id = 'dataagent'
const app = createServer()

function post(path: string, body: unknown) {
    return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

beforeAll(async () => {
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: 'data agent' }))
})

describe('agent database over HTTP', () => {
    it('creates a table and lists it back with its columns', async () => {
        const created = await post(`/agents/${id}/data/execute`, { sql: 'CREATE TABLE leads (id INTEGER PRIMARY KEY, email TEXT NOT NULL, score REAL)' })
        expect(created.status).toBe(200)

        const tables = (await (await app.request(`/agents/${id}/data/tables`)).json()) as { tables: { name: string; columns: { name: string; type: string; pk: boolean }[] }[] }
        const leads = tables.tables.find(t => t.name === 'leads')
        expect(leads?.columns.map(c => `${c.name}:${c.type}`)).toEqual(['id:INTEGER', 'email:TEXT', 'score:REAL'])
        expect(leads?.columns[0].pk).toBe(true)
    })

    it('runs a batch of statements atomically and reads the rows back', async () => {
        const inserted = await post(`/agents/${id}/data/execute`, {
            statements: [
                { sql: 'INSERT INTO leads (email, score) VALUES (?, ?)', params: ['a@example.com', 0.5] },
                { sql: 'INSERT INTO leads (email, score) VALUES (?, ?)', params: ['b@example.com', 0.9] },
            ],
        })
        expect(inserted.status).toBe(200)
        expect(await inserted.json()).toMatchObject({ statements: 2, rowsAffected: 2 })

        const read = await post(`/agents/${id}/data/query`, { sql: 'SELECT email, score FROM leads ORDER BY score DESC' })
        expect(read.status).toBe(200)
        expect(await read.json()).toMatchObject({
            columns: ['email', 'score'],
            rows: [
                { email: 'b@example.com', score: 0.9 },
                { email: 'a@example.com', score: 0.5 },
            ],
            rowCount: 2,
            truncated: false,
        })
    })

    it('caps the rows it returns and says so', async () => {
        const read = await post(`/agents/${id}/data/query`, { sql: 'SELECT * FROM leads', limit: 1 })
        expect(await read.json()).toMatchObject({ rowCount: 2, truncated: true })
    })

    it('refuses a write on the query endpoint', async () => {
        expect((await post(`/agents/${id}/data/query`, { sql: 'DELETE FROM leads' })).status).toBe(400)
        expect((await post(`/agents/${id}/data/query`, { sql: 'WITH doomed AS (SELECT id FROM leads) DELETE FROM leads' })).status).toBe(400)

        const still = await post(`/agents/${id}/data/query`, { sql: 'SELECT count(*) AS n FROM leads' })
        expect(((await still.json()) as { rows: { n: number }[] }).rows[0].n).toBe(2)
    })

    it('refuses file access on both endpoints', async () => {
        expect((await post(`/agents/${id}/data/query`, { sql: "SELECT readfile('/etc/passwd') AS v" })).status).toBe(400)
        expect((await post(`/agents/${id}/data/query`, { sql: 'SELECT "readfile"(\'/etc/passwd\') AS v' })).status).toBe(400)
        expect((await post(`/agents/${id}/data/execute`, { sql: "SELECT writefile('/tmp/pwned', 'x')" })).status).toBe(400)
        expect((await post(`/agents/${id}/data/execute`, { sql: "VACUUM INTO '/tmp/copy.db'" })).status).toBe(400)
    })

    it('lets a write keyword through when it only appears inside a literal', async () => {
        const read = await post(`/agents/${id}/data/query`, { sql: "SELECT 'delete from nowhere' AS note" })
        expect(read.status).toBe(200)
    })

    it('reports a bad statement instead of throwing', async () => {
        const res = await post(`/agents/${id}/data/execute`, { sql: 'INSERT INTO ghosts (x) VALUES (1)' })
        expect(res.status).toBe(400)
        expect((await res.json()) as { error: string }).toHaveProperty('error')
    })

    it('404s on an unknown agent', async () => {
        expect((await post('/agents/ghost/data/query', { sql: 'SELECT 1' })).status).toBe(404)
    })

    it('purges every row and keeps the table', async () => {
        const purged = await app.request(`/agents/${id}/data/tables/leads/purge`, { method: 'POST' })
        expect(purged.status).toBe(200)
        expect(await purged.json()).toMatchObject({ deleted: 2 })

        const tables = (await (await app.request(`/agents/${id}/data/tables`)).json()) as { tables: { name: string; columns: { name: string }[] }[] }
        expect(tables.tables.find(t => t.name === 'leads')?.columns.map(c => c.name)).toEqual(['id', 'email', 'score'])

        const rows = (await (await app.request(`/agents/${id}/data/tables/leads/rows`)).json()) as { total: number }
        expect(rows.total).toBe(0)
    })
})
