import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-rewind-read-'))
process.env.LUMVIKA_API_KEY = ''

const { beforeAll, describe, expect, it } = await import('vitest')
const { agentDir, workspaceDir } = await import('../config/paths.js')
const { writeAgentConfig } = await import('../agents/config-write.js')
const { agentConfigSchema } = await import('../agents/types.js')
const { getSystemDb } = await import('../db/systemDb.js')
const { readAgentRewind } = await import('./read.js')
const { OUTPUT_MAX_CHARS } = await import('./report.js')

const FROM = '2026-09-07T00:00:00.000Z'
const TO = '2026-09-14T00:00:00.000Z'
const LONG_TEXT = 'word '.repeat(300)

async function createAgent(id: string, mcpServers: { name: string }[] = []) {
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: id, mcpServers }))
}

function text(value: string) {
    return JSON.stringify([{ type: 'text', text: value }])
}

beforeAll(async () => {
    await createAgent('busy', [{ name: 'gmail' }, { name: 'drive-server' }, { name: 'hs' }])
    await createAgent('quiet')

    await mkdir(resolve(workspaceDir('busy'), '.lumvika'), { recursive: true })
    await writeFile(
        resolve(workspaceDir('busy'), '.lumvika/services.json'),
        JSON.stringify({ services: { 'google-drive': { oauth: { serverName: 'drive-server' } }, hubspot: { managed: { serverName: 'hs' } }, gmail: {} } }),
    )

    const { client } = await getSystemDb('busy')
    await client.executeMultiple(`
INSERT INTO runs (id, agent_id, session_id, status, started_at, finished_at, trigger_source, model, total_tokens, cost_micros) VALUES
    ('before', 'busy', 'sess-before', 'done', '2026-09-06T23:59:59.999Z', '2026-09-07T00:10:00.000Z', 'schedule', 'opus', 1000, 1000),
    ('at-from', 'busy', 'sess-sched', 'done', '2026-09-07T00:00:00.000Z', '2026-09-07T00:01:00.000Z', 'schedule', 'opus', 10, 5),
    ('long', 'busy', 'sess-long', 'done', '2026-09-08T10:00:00.000Z', '2026-09-08T10:10:00.000Z', NULL, 'haiku', 20, NULL),
    ('silent', 'busy', 'sess-silent', 'done', '2026-09-09T10:00:00.000Z', '2026-09-09T10:00:30.000Z', 'trigger', 'opus', 30, NULL),
    ('errored', 'busy', 'sess-err', 'error', '2026-09-10T10:00:00.000Z', '2026-09-10T10:00:05.000Z', 'chat', 'opus', NULL, NULL),
    ('at-to', 'busy', 'sess-to', 'done', '2026-09-14T00:00:00.000Z', '2026-09-14T00:05:00.000Z', 'schedule', 'opus', 1000, 1000),
    ('foreign', 'other', 'sess-x', 'done', '2026-09-08T00:00:00.000Z', '2026-09-08T00:05:00.000Z', 'schedule', 'opus', 1000, 1000);

INSERT INTO tool_calls (id, run_id, agent_id, session_id, step_number, tool_name, is_error, created_at) VALUES
    ('t1', 'long', 'busy', 's', 0, 'web_search', 0, '2026-09-07T00:00:00.000Z'),
    ('t2', 'long', 'busy', 's', 0, 'web_search', 1, '2026-09-08T00:00:00.000Z'),
    ('t3', 'long', 'busy', 's', 0, 'gmail_send', 0, '2026-09-08T00:00:00.000Z'),
    ('t4', 'long', 'busy', 's', 0, 'mcp__drive-server__list', 0, '2026-09-08T00:00:00.000Z'),
    ('t5', 'long', 'busy', 's', 0, 'hs_search', 0, '2026-09-08T00:00:00.000Z'),
    ('t6', 'long', 'busy', 's', 0, 'hs_search', 1, '2026-09-08T00:00:00.000Z'),
    ('t7', 'long', 'busy', 's', 0, 'hs_search', 0, '2026-09-08T00:00:00.000Z'),
    ('t8', 'long', 'busy', 's', 0, 'mcp__lumvika__notify_user', 0, '2026-09-08T00:00:00.000Z'),
    ('t-before', 'long', 'busy', 's', 0, 'web_search', 1, '2026-09-06T23:59:59.999Z'),
    ('t-to', 'long', 'busy', 's', 0, 'web_search', 1, '2026-09-14T00:00:00.000Z'),
    ('t-foreign', 'long', 'other', 's', 0, 'web_search', 1, '2026-09-08T00:00:00.000Z');

INSERT INTO sessions (id, agent_id, title, source, origin_agent_id, created_at, updated_at) VALUES
    ('sess-sched', 'busy', 'Morning digest', 'schedule', NULL, '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z'),
    ('sess-silent', 'busy', 'Silent hook', 'trigger', NULL, '2026-09-09T10:00:00.000Z', '2026-09-09T10:00:00.000Z'),
    ('d1', 'busy', 'delegated: a', 'delegate', 'boss', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z'),
    ('d2', 'busy', 'delegated: b', 'delegate', 'boss', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z'),
    ('d3', 'busy', 'from peer', 'agent', 'peer', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'),
    ('d-before', 'busy', 'delegated: c', 'delegate', 'boss', '2026-09-06T23:59:59.999Z', '2026-09-06T23:59:59.999Z'),
    ('d-to', 'busy', 'delegated: d', 'delegate', 'boss', '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z'),
    ('d-foreign', 'other', 'delegated: e', 'delegate', 'boss', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');

INSERT INTO memories (id, agent_id, path, content, kind, created_at, last_accessed_at, access_count) VALUES
    ('m-top', 'busy', 'a.md', '  Remember
   the    milk  ', 'note', '2026-09-07T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 5),
    ('m-low', 'busy', 'b.md', 'low', 'note', '2026-09-08T00:00:00.000Z', '2026-09-11T00:00:00.000Z', 2),
    ('m-late', 'busy', 'c.md', 'accessed at the bound', 'note', '2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z', 9),
    ('m-at-to', 'busy', 'd.md', 'created at the bound', 'note', '2026-09-14T00:00:00.000Z', NULL, 0);
`)
    await client.batch([
        { sql: 'INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)', args: ['q1', 'sess-sched', 'user', text('go'), '2026-09-07T00:00:00.000Z'] },
        { sql: 'INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)', args: ['a1', 'sess-sched', 'assistant', text('  Line one\n\n   line   two  '), '2026-09-07T00:00:30.000Z'] },
        { sql: 'INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)', args: ['a2', 'sess-sched', 'assistant', text('after the run'), '2026-09-07T00:05:00.000Z'] },
        { sql: 'INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)', args: ['a3', 'sess-long', 'assistant', text(LONG_TEXT), '2026-09-08T10:05:00.000Z'] },
        { sql: 'INSERT INTO messages (id, session_id, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)', args: ['q2', 'sess-silent', 'user', text('ping'), '2026-09-09T10:00:10.000Z'] },
    ])
})

describe('readAgentRewind', () => {
    it('counts runs inside [from, to) for this agent only', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.from).toBe(FROM)
        expect(report.to).toBe(TO)
        expect(report.runs).toEqual({ total: 4, done: 3, error: 1, cancelled: 0 })
        expect(report.tokens).toBe(60)
        expect(report.costMicros).toBe(5)
        expect(report.workedMs).toBe(60_000 + 600_000 + 30_000 + 5_000)
    })

    it('counts tool calls inside the window and maps MCP servers to their connector slug', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.tools.total).toBe(8)
        expect(report.tools.errors).toBe(2)
        expect(report.tools.top).toEqual([
            { name: 'web_search', count: 2 },
            { name: 'notify_user', count: 1 },
        ])
        expect(report.connectors).toEqual([
            { name: 'hubspot', count: 3 },
            { name: 'gmail', count: 1 },
            { name: 'google-drive', count: 1 },
        ])
    })

    it('counts sessions in the window and groups the callers by origin agent', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.sessions).toBe(5)
        expect([...report.calledBy].sort((a, b) => a.agentId.localeCompare(b.agentId))).toEqual([
            { agentId: 'boss', count: 2 },
            { agentId: 'peer', count: 1 },
        ])
    })

    it('reports created memories and the most recalled one in the window', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.memories).toEqual({ created: 2, topRecalled: { content: 'Remember the milk', accessCount: 5 } })
    })

    it('collects run outputs, flattened, clipped, titled, skipping runs that said nothing', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.outputs.map(output => output.runId)).toEqual(['at-from', 'long'])
        expect(report.outputs[0]).toEqual({ runId: 'at-from', startedAt: FROM, source: 'schedule', title: 'Morning digest', text: 'Line one line two' })

        const long = report.outputs[1]
        expect(long).toMatchObject({ source: 'chat', title: 'Untitled' })
        expect(long.text).toHaveLength(OUTPUT_MAX_CHARS + 1)
        expect(long.text.endsWith('…')).toBe(true)
        expect(long.text.startsWith('word word')).toBe(true)
    })

    it('titles the longest run from its session, or Untitled when the session is gone', async () => {
        const report = await readAgentRewind('busy', FROM, TO)
        expect(report.longestRun).toEqual({ runId: 'long', durationMs: 600_000, startedAt: '2026-09-08T10:00:00.000Z', title: 'Untitled' })
    })

    it('counts every account of an app toward that app', async () => {
        await createAgent('multi', [{ name: 'gmail' }, { name: 'gmail-k3x9ab' }, { name: 'gmail-legacy' }, { name: 'gmail-auth' }])
        await mkdir(resolve(workspaceDir('multi'), '.lumvika'), { recursive: true })
        await writeFile(
            resolve(workspaceDir('multi'), '.lumvika/services.json'),
            JSON.stringify({
                services: {
                    gmail: { mcpServers: ['gmail'] },
                    'gmail@k3x9ab': { instanceId: 'k3x9ab', mcpServers: ['gmail-k3x9ab'] },
                    'gmail@lg0001': { toolNames: ['gmail-legacy'] },
                    'gmail@a1b2c3': { instanceId: 'a1b2c3', mcpServers: [], composio: { serverName: 'gmail-auth' } },
                },
            }),
        )
        const { client } = await getSystemDb('multi')
        await client.executeMultiple(`
INSERT INTO tool_calls (id, run_id, agent_id, session_id, step_number, tool_name, is_error, created_at) VALUES
    ('m1', 'r', 'multi', 's', 0, 'gmail_send', 0, '2026-09-08T00:00:00.000Z'),
    ('m2', 'r', 'multi', 's', 0, 'gmail-k3x9ab_send', 0, '2026-09-08T00:00:00.000Z'),
    ('m3', 'r', 'multi', 's', 0, 'mcp__gmail-k3x9ab__search', 0, '2026-09-08T00:00:00.000Z'),
    ('m4', 'r', 'multi', 's', 0, 'gmail-auth_send', 0, '2026-09-08T00:00:00.000Z'),
    ('m5', 'r', 'multi', 's', 0, 'gmail-legacy_send', 0, '2026-09-08T00:00:00.000Z');
`)
        const report = await readAgentRewind('multi', FROM, TO)
        expect(report.connectors).toEqual([{ name: 'gmail', count: 5 }])
    })

    it('reports an empty week for an agent without activity nor registry', async () => {
        const report = await readAgentRewind('quiet', FROM, TO)
        expect(report.runs).toEqual({ total: 0, done: 0, error: 0, cancelled: 0 })
        expect(report.sessions).toBe(0)
        expect(report.calledBy).toEqual([])
        expect(report.memories).toEqual({ created: 0, topRecalled: null })
        expect(report.outputs).toEqual([])
        expect(report.connectors).toEqual([])
        expect(report.longestRun).toBeNull()
        expect(report.costMicros).toBeNull()
    })

    it('rejects an unknown agent', async () => {
        await expect(readAgentRewind('ghost', FROM, TO)).rejects.toMatchObject({ status: 404 })
    })
})
