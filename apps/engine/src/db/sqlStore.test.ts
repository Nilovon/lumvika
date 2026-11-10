import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'rerun-sqlstore-'))
process.env.RERUN_DATA_DIR = dataDir

const { describe, expect, it } = await import('vitest')
const { openStore, listTables, readTableRows, groupTableRows, deleteTableRows, dropTable, executeStore, queryStore, assertNoAttach, assertNoSqlFileAccess, assertReadOnlySql, withBusyRetry } = await import('./sqlStore.js')
const { getAgentDb, readAgentDbSchema } = await import('./agentDb.js')

const AGENT = 'agent-data-test'

async function seed() {
    const client = await getAgentDb(AGENT)
    await client.executeMultiple(`
CREATE TABLE contacts (name TEXT, email TEXT);
INSERT INTO contacts (name, email) VALUES ('Alice', 'a@x.com'), ('Bob', 'b@x.com'), ('Carol', 'c@x.com');
CREATE TABLE tags (id TEXT PRIMARY KEY, label TEXT) WITHOUT ROWID;
INSERT INTO tags (id, label) VALUES ('t1', 'urgent');
`)
    return client
}

describe('sqlStore row deletion', () => {
    it('exposes __rowid on rowid tables but not as a visible column', async () => {
        const client = await seed()
        const result = await readTableRows(client, 'contacts', { limit: 50, offset: 0 })
        expect(result.columns).toEqual(['name', 'email'])
        expect(result.rows).toHaveLength(3)
        for (const row of result.rows) expect(row.__rowid).toBeDefined()
    })

    it('deletes a single row by rowid', async () => {
        const client = await getAgentDb(AGENT)
        const before = await readTableRows(client, 'contacts', { limit: 50, offset: 0 })
        const target = before.rows.find(r => r.name === 'Bob')!
        const res = await deleteTableRows(client, 'contacts', [target.__rowid as number])
        expect(res.deleted).toBe(1)
        const after = await readTableRows(client, 'contacts', { limit: 50, offset: 0 })
        expect(after.total).toBe(2)
        expect(after.rows.map(r => r.name)).not.toContain('Bob')
    })

    it('deletes multiple rows in one call', async () => {
        const client = await getAgentDb(AGENT)
        const rows = (await readTableRows(client, 'contacts', { limit: 50, offset: 0 })).rows
        const ids = rows.map(r => r.__rowid as number)
        const res = await deleteTableRows(client, 'contacts', ids)
        expect(res.deleted).toBe(rows.length)
        expect((await readTableRows(client, 'contacts', { limit: 50, offset: 0 })).total).toBe(0)
    })

    it('does not expose __rowid and refuses deletion on WITHOUT ROWID tables', async () => {
        const client = await getAgentDb(AGENT)
        const result = await readTableRows(client, 'tags', { limit: 50, offset: 0 })
        expect(result.rows[0].__rowid).toBeUndefined()
        await expect(deleteTableRows(client, 'tags', ['t1'])).rejects.toThrow(/no rowid/i)
    })

    it('drops an entire table', async () => {
        const client = await getAgentDb(AGENT)
        await dropTable(client, 'tags')
        const names = (await listTables(client)).map(t => t.name)
        expect(names).not.toContain('tags')
    })

    it('rejects operations on unknown tables', async () => {
        const client = await getAgentDb(AGENT)
        await expect(deleteTableRows(client, 'nope', [1])).rejects.toThrow(/not found/i)
        await expect(dropTable(client, 'nope')).rejects.toThrow(/not found/i)
    })

    it('hides the tables it is told to hide, including from reads', async () => {
        const client = await getAgentDb(AGENT)
        await client.execute('CREATE TABLE IF NOT EXISTS _internal (k TEXT)')
        expect((await listTables(client, ['_internal'])).map(t => t.name)).not.toContain('_internal')
        await expect(readTableRows(client, '_internal', { limit: 10, offset: 0, hidden: ['_internal'] })).rejects.toThrow(/not found/i)
    })
})

describe('sqlStore filters and groups', () => {
    async function seedTasks() {
        const client = await openStore('tasks', resolve(dataDir, 'tasks.db'), dataDir)
        await client.executeMultiple(`
CREATE TABLE tasks (title TEXT, status TEXT, points INTEGER);
INSERT INTO tasks VALUES ('a', 'todo', 1), ('b', 'todo', 2), ('c', 'done', 3), ('d', NULL, 5), ('e', 'todo', 8);
`)
        return client
    }

    it('filters on equalities, null included, and counts only what matches', async () => {
        const client = await seedTasks()
        const todo = await readTableRows(client, 'tasks', { limit: 1, offset: 0, where: [{ column: 'status', equals: 'todo' }] })
        expect(todo.total).toBe(3)
        expect(todo.rows).toHaveLength(1)
        const unset = await readTableRows(client, 'tasks', { limit: 10, offset: 0, where: [{ column: 'status', equals: null }] })
        expect(unset.rows.map(r => r.title)).toEqual(['d'])
        const both = await readTableRows(client, 'tasks', { limit: 10, offset: 0, where: [{ column: 'status', equals: 'todo' }, { column: 'points', equals: 8 }] })
        expect(both.rows.map(r => r.title)).toEqual(['e'])
    })

    it('refuses to filter on a column the table does not have', async () => {
        const client = await openStore('tasks', resolve(dataDir, 'tasks.db'), dataDir)
        await expect(readTableRows(client, 'tasks', { limit: 10, offset: 0, where: [{ column: 'owner', equals: 'x' }] })).rejects.toThrow(/Column not found/)
    })

    it('counts and sums every group over the whole table, largest first', async () => {
        const client = await openStore('tasks', resolve(dataDir, 'tasks.db'), dataDir)
        const groups = await groupTableRows(client, 'tasks', { groupBy: 'status', sumColumn: 'points', limit: 10 })
        expect(groups).toEqual([
            { value: 'todo', total: 3, sum: 11 },
            { value: 'done', total: 1, sum: 3 },
            { value: null, total: 1, sum: 5 },
        ])
        expect(await groupTableRows(client, 'tasks', { groupBy: 'status', limit: 1 })).toEqual([{ value: 'todo', total: 3 }])
        const filtered = await groupTableRows(client, 'tasks', { groupBy: 'status', where: [{ column: 'points', equals: 8 }], limit: 10 })
        expect(filtered).toEqual([{ value: 'todo', total: 1 }])
    })
})

describe('sqlStore hardening', () => {
    it('opens every database in WAL with a busy timeout', async () => {
        const client = await getAgentDb(AGENT)
        const journal = await client.execute('PRAGMA journal_mode')
        expect(String(journal.rows[0].journal_mode).toLowerCase()).toBe('wal')
        const timeout = await client.execute('PRAGMA busy_timeout')
        expect(Number(timeout.rows[0].timeout)).toBe(5000)
    })

    it('returns the same client for the same key', async () => {
        expect(await getAgentDb(AGENT)).toBe(await getAgentDb(AGENT))
    })

    it('refuses ATTACH so no database can be reached by path', async () => {
        expect(() => assertNoAttach("ATTACH DATABASE '/tmp/other.db' AS other")).toThrow(/ATTACH/i)
        expect(() => assertNoAttach("SELECT 'attach' AS note")).not.toThrow()
        const client = await getAgentDb(AGENT)
        await expect(executeStore(client, { sql: "ATTACH DATABASE '/tmp/other.db' AS other", params: [] })).rejects.toThrow(/ATTACH/i)
        await expect(
            executeStore(client, { params: [], statements: [{ sql: 'SELECT 1', params: [] }, { sql: "ATTACH DATABASE '/tmp/other.db' AS other", params: [] }] })
        ).rejects.toThrow(/ATTACH/i)
    })

    it('refuses the file functions libsql ships, whatever the quoting', () => {
        for (const sql of [
            "SELECT readfile('/etc/passwd')",
            "SELECT writefile('/tmp/x', 'y')",
            "SELECT name FROM fsdir('/etc')",
            "SELECT load_extension('/tmp/evil.so')",
            "SELECT \"readfile\"('/etc/passwd')",
            "SELECT [readfile]('/etc/passwd')",
            "SELECT `readfile`('/etc/passwd')",
            "SELECT ReadFile('/etc/passwd')",
            "select /* nothing */ readfile ('/etc/passwd')",
            "VACUUM INTO '/tmp/copy.db'",
            'vacuum main into \'/tmp/copy.db\'',
            "SELECT 'a -- b', readfile('/etc/passwd')",
            "SELECT '/*', readfile('/etc/passwd'), '*/'",
            "SELECT '-- x', writefile('/tmp/p', 'y')",
        ]) {
            expect(() => assertNoSqlFileAccess(sql), sql).toThrow(/File access/)
            expect(() => assertNoAttach(sql), sql).toThrow(/File access/)
        }
        expect(() => assertNoSqlFileAccess("SELECT 'readfile' AS note, 1 AS writefile_count")).not.toThrow()
        expect(() => assertNoSqlFileAccess("SELECT * FROM files WHERE path = 'fsdir(x)'")).not.toThrow()
        expect(() => assertNoSqlFileAccess("SELECT 'it''s -- fine' AS s")).not.toThrow()
    })

    it('does not let a comment marker inside a string hide a write from the read-only check', () => {
        expect(() => assertReadOnlySql("WITH x AS (SELECT '--') DELETE FROM t")).toThrow(/writes/)
        expect(() => assertReadOnlySql("SELECT '/*' AS a, 1 AS b; DELETE FROM t; SELECT '*/'")).toThrow(/writes/)
        expect(() => assertReadOnlySql("SELECT 'it''s -- fine' AS s")).not.toThrow()
    })

    it('refuses the file functions on the query and execute paths', async () => {
        const client = await getAgentDb(AGENT)
        await expect(queryStore(client, "SELECT readfile('/etc/passwd') AS v", [], 10)).rejects.toThrow(/File access/)
        await expect(queryStore(client, "SELECT 'a -- b', readfile('/etc/passwd') AS v", [], 10)).rejects.toThrow(/File access/)
        await expect(executeStore(client, { sql: "SELECT writefile('/tmp/x', 'y')", params: [] })).rejects.toThrow(/File access/)
        await expect(executeStore(client, { sql: "VACUUM INTO '/tmp/copy.db'", params: [] })).rejects.toThrow(/File access/)
        await expect(
            executeStore(client, { params: [], statements: [{ sql: 'SELECT 1', params: [] }, { sql: "SELECT fsdir('/')", params: [] }] })
        ).rejects.toThrow(/File access/)
    })

    it('retries a busy statement and gives up on anything else', async () => {
        let calls = 0
        const value = await withBusyRetry(async () => {
            calls++
            if (calls < 3) throw new Error('SQLITE_BUSY: database is locked')
            return 'done'
        })
        expect(value).toBe('done')
        expect(calls).toBe(3)

        let others = 0
        await expect(
            withBusyRetry(async () => {
                others++
                throw new Error('no such table: ghosts')
            })
        ).rejects.toThrow(/no such table/)
        expect(others).toBe(1)
    })

    it('lets concurrent writers through instead of failing on a locked database', async () => {
        const a = await openStore('concurrent', resolve(dataDir, 'concurrent.db'), dataDir)
        const b = await openStore('concurrent-second', resolve(dataDir, 'concurrent.db'), dataDir)
        await executeStore(a, { sql: 'CREATE TABLE queue (n INTEGER)', params: [] })
        await Promise.all(
            Array.from({ length: 20 }, (_, i) =>
                executeStore(i % 2 === 0 ? a : b, { sql: 'INSERT INTO queue (n) VALUES (?)', params: [i] })
            )
        )
        const counted = await queryStore(a, 'SELECT count(*) AS n FROM queue', [], 10)
        expect(Number(counted.rows[0].n)).toBe(20)
    })
})

describe('agentDb adapter', () => {
    it('renders a schema without opening a database that does not exist', async () => {
        expect(await readAgentDbSchema('never-existed')).toBe('')
    })

    it('renders one line per table with its columns', async () => {
        await getAgentDb(AGENT)
        const schema = await readAgentDbSchema(AGENT)
        expect(schema).toContain('contacts(name TEXT, email TEXT)')
    })
})
