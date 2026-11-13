import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-assistant-sessions-'))

const { beforeAll, describe, expect, it } = await import('vitest')
const { existsSync } = await import('node:fs')
const { mkdir, symlink, writeFile } = await import('node:fs/promises')
const { dirname, join } = await import('node:path')
const { migrate } = await import('../db/migrate.js')
const { ensureAssistant } = await import('./assistant.js')
const { agentDir, workspaceDir } = await import('../config/paths.js')
const { createSession } = await import('../db/repos/sessions.js')
const { appendMessage } = await import('../db/repos/messages.js')
const { startRun } = await import('../db/repos/runs.js')
const { getSystemDb } = await import('../db/systemDb.js')
const { claimSession, releaseSession } = await import('../runtime/run-control.js')
const { rememberCodexThread, codexThreadToResume } = await import('./codex-threads.js')
const { createServer } = await import('../http/server.js')

const app = createServer()
const del = (agentId: string, sessionId: string) => app.request(`/agents/${agentId}/sessions/${sessionId}`, { method: 'DELETE' })

async function page(path: string, body = 'x') {
    const file = join(workspaceDir('assistant'), path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, body)
    return file
}

const inWorkspace = (path: string) => existsSync(join(workspaceDir('assistant'), path))

// One conversation with everything a run leaves behind: a message in the search index, a run with a
// step and a tool call, a compaction checkpoint, and the pages its web_fetch saved.
async function seedConversation(label: string, pageBase: string) {
    const session = await createSession('assistant', label)
    await appendMessage('assistant', session.id, { role: 'user', content: `${label}: read the pricing page` })
    await appendMessage('assistant', session.id, { role: 'tool', content: [{ type: 'tool-result', toolCallId: `${label}-call`, toolName: 'web_fetch', output: { type: 'text', value: `[200] https://example.com/\nSaved whole: .lumvika/pages/${pageBase}.served.html (read or grep it)` } }] } as never)
    const run = await startRun('assistant', session.id)
    const { client } = await getSystemDb('assistant')
    const now = new Date().toISOString()
    await client.batch([
        { sql: 'INSERT INTO run_steps (id, run_id, agent_id, session_id, step_number, created_at) VALUES (?, ?, ?, ?, 1, ?)', args: [`${label}-step`, run.id, 'assistant', session.id, now] },
        { sql: 'INSERT INTO tool_calls (id, run_id, agent_id, session_id, step_number, tool_name, result_json, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)', args: [`${label}-tool`, run.id, 'assistant', session.id, 'web_fetch', JSON.stringify(`Saved whole: .lumvika/pages/${pageBase}.rendered.md (read it)`), now] },
        { sql: 'INSERT INTO tool_calls (id, run_id, agent_id, session_id, step_number, tool_name, result_json, created_at) VALUES (?, ?, ?, ?, 2, ?, NULL, ?)', args: [`${label}-tool-2`, run.id, 'assistant', session.id, 'web_search', now] },
        { sql: 'INSERT INTO compaction_checkpoints (id, session_id, summary_json, through_message_id, through_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [`${label}-checkpoint`, session.id, '"summary"', 'm', now, now] },
    ])
    await page(`.lumvika/pages/${pageBase}.served.html`)
    await page(`.lumvika/pages/${pageBase}.rendered.md`)
    await page(`.lumvika/pages/${pageBase}.meta.json`, JSON.stringify({ url: 'https://example.com/', views: { served: { file: `.lumvika/pages/${pageBase}.served.html` }, rendered: { file: `.lumvika/pages/${pageBase}.rendered.md` }, browser: { file: '../outside.browser.html' } } }))
    return session
}

async function countFor(sessionId: string) {
    const { client } = await getSystemDb('assistant')
    const count = async (sql: string) => Number((await client.execute({ sql, args: [sessionId] })).rows[0].n)
    return {
        sessions: await count('SELECT COUNT(*) AS n FROM sessions WHERE id = ?'),
        messages: await count('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?'),
        fts: await count('SELECT COUNT(*) AS n FROM messages_fts WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)'),
        runs: await count('SELECT COUNT(*) AS n FROM runs WHERE session_id = ?'),
        steps: await count('SELECT COUNT(*) AS n FROM run_steps WHERE session_id = ?'),
        tools: await count('SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = ?'),
        checkpoints: await count('SELECT COUNT(*) AS n FROM compaction_checkpoints WHERE session_id = ?'),
    }
}

async function ftsRows(text: string) {
    const { client } = await getSystemDb('assistant')
    return Number((await client.execute({ sql: 'SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH ?', args: [text] })).rows[0].n)
}

beforeAll(async () => {
    await migrate()
    await ensureAssistant()
})

describe('DELETE /agents/assistant/sessions/:sid', () => {
    it('erases the conversation, its runs and the pages it read, and nothing of another one', async () => {
        const doomed = await seedConversation('doomed', 'example.com/index')
        const kept = await seedConversation('kept', 'other.org/index')
        rememberCodexThread('assistant', doomed.id, { threadId: 't1', connectionId: 'c1', throughMessageId: 'm1' })
        await writeFile(join(agentDir('assistant'), 'outside.browser.html'), 'not a page of the workspace')

        const res = await del('assistant', doomed.id)

        expect(res.status).toBe(200)
        expect(await countFor(doomed.id)).toEqual({ sessions: 0, messages: 0, fts: 0, runs: 0, steps: 0, tools: 0, checkpoints: 0 })
        expect(await ftsRows('doomed')).toBe(0)
        expect(await countFor(kept.id)).toEqual({ sessions: 1, messages: 2, fts: 1, runs: 1, steps: 1, tools: 2, checkpoints: 1 })
        expect(inWorkspace('.lumvika/pages/example.com/index.served.html')).toBe(false)
        expect(inWorkspace('.lumvika/pages/example.com/index.rendered.md')).toBe(false)
        expect(inWorkspace('.lumvika/pages/example.com/index.meta.json')).toBe(false)
        expect(inWorkspace('.lumvika/pages/other.org/index.served.html')).toBe(true)
        expect(existsSync(join(agentDir('assistant'), 'outside.browser.html'))).toBe(true)
        expect(codexThreadToResume('assistant', doomed.id, 'c1', 'm1')).toBeUndefined()
        expect((await del('assistant', doomed.id)).status).toBe(404)
    })

    it('never follows a saved page path out of the pages folder', async () => {
        const session = await createSession('assistant', 'sneaky')
        await appendMessage('assistant', session.id, { role: 'assistant', content: 'Saved whole: .lumvika/pages/../../keep.served.html and Saved whole: .lumvika/pages/notes.txt and Saved whole: .lumvika/pages/away/keep.served.html' })
        await mkdir(join(workspaceDir('assistant'), '.lumvika/pages'), { recursive: true })
        await symlink(agentDir('assistant'), join(workspaceDir('assistant'), '.lumvika/pages/away'))
        const outside = join(agentDir('assistant'), 'keep.served.html')
        await writeFile(outside, 'mine')
        await page('.lumvika/pages/notes.txt')

        expect((await del('assistant', session.id)).status).toBe(200)
        expect(existsSync(outside)).toBe(true)
        expect(inWorkspace('.lumvika/pages/notes.txt')).toBe(true)
        expect(existsSync(join(agentDir('assistant'), 'keep.served.html'))).toBe(true)
    })

    it('refuses while a run is still going on the conversation', async () => {
        const session = await createSession('assistant', 'busy')
        claimSession(session.id, 'run-live')
        const busy = await del('assistant', session.id)
        expect(busy.status).toBe(409)
        expect(await busy.json()).toMatchObject({ code: 'run_in_flight' })
        expect((await countFor(session.id)).sessions).toBe(1)

        releaseSession('run-live')
        expect((await del('assistant', session.id)).status).toBe(200)
    })

    it("knows no conversation of another agent, and erases none of a coworker's", async () => {
        const coworkerSession = await createSession('coworker', 'history')
        expect((await del('assistant', coworkerSession.id)).status).toBe(404)
        expect((await del('coworker', coworkerSession.id)).status).toBe(403)
    })

    it('says on /health that it can erase a conversation', async () => {
        const health = (await (await app.request('/health')).json()) as { capabilities: string[] }
        expect(health.capabilities).toContain('assistant.sessions.delete')
    })
})
