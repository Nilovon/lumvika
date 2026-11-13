import { readFile, rm } from 'node:fs/promises'
import { ASSISTANT_AGENT_ID } from '@lumvika/contracts'
import { getSystemDb } from '../db/systemDb.js'
import { sessionBelongsToAgent } from '../db/repos/sessions.js'
import { sessionClaim } from '../runtime/run-control.js'
import { workspaceDir } from '../config/paths.js'
import { resolveInWorkspace, resolveWithinReal } from '../tools/sandbox.js'
import { PAGES_DIR } from '../tools/builtin/page-file.js'
import { forgetCodexThread } from './codex-threads.js'
import { forgetClaudeSession } from './claude-sessions.js'

export type AssistantSessionDeletion = 'deleted' | 'not_found' | 'run_in_flight'

// A read page is cached in the assistant's folder under its URL, and the tool result that saved it
// names the file: that line is how the files a conversation left behind are found again.
const SAVED_PAGE = /Saved whole: (\.lumvika\/pages\/[\w./-]+)/g
const VIEW_FILE = /\.(served|rendered|browser)\.[\w-]+$/

const SESSION_ROWS = ['messages', 'run_steps', 'tool_calls', 'runs', 'compaction_checkpoints', 'skill_proposals'] as const

function savedPagesIn(texts: unknown[]): Set<string> {
    const pages = new Set<string>()
    for (const text of texts) {
        if (typeof text !== 'string') continue
        for (const match of text.matchAll(SAVED_PAGE)) pages.add(match[1])
    }
    return pages
}

// The page file, every other view of the same URL its meta lists, and the meta itself. A path that
// would leave the workspace, or a file already gone, is skipped.
async function removeSavedPage(path: string): Promise<void> {
    if (!path.startsWith(`${PAGES_DIR}/`) || path.split('/').includes('..') || !VIEW_FILE.test(path)) return
    const metaPath = path.replace(VIEW_FILE, '.meta.json')
    const meta = await resolveInWorkspace(ASSISTANT_AGENT_ID, metaPath)
        .then(file => readFile(file, 'utf8'))
        .then(text => JSON.parse(text) as { views?: Record<string, { file?: unknown }> })
        .catch(() => null)
    const views = Object.values(meta?.views ?? {}).flatMap(view => (typeof view.file === 'string' && view.file.startsWith(`${PAGES_DIR}/`) ? [view.file] : []))
    for (const file of new Set([path, ...views, metaPath])) {
        await resolveWithinReal(workspaceDir(ASSISTANT_AGENT_ID), file, { followLast: false })
            .then(resolved => rm(resolved, { force: true }))
            .catch(() => {})
    }
}

// Erases one conversation of the assistant for good: its transcript and search index, its runs with
// their steps and tool calls, its compaction checkpoints, and the pages it read. A run still going
// on it would write into what is being erased, so the caller stops it first.
export async function deleteAssistantSession(sessionId: string): Promise<AssistantSessionDeletion> {
    if (!(await sessionBelongsToAgent(sessionId, ASSISTANT_AGENT_ID))) return 'not_found'
    if (sessionClaim(sessionId)) return 'run_in_flight'

    const { client } = await getSystemDb(ASSISTANT_AGENT_ID)
    const [messages, tools] = await Promise.all([
        client.execute({ sql: 'SELECT content_json FROM messages WHERE session_id = ?', args: [sessionId] }),
        client.execute({ sql: 'SELECT result_json FROM tool_calls WHERE session_id = ?', args: [sessionId] }),
    ])
    const pages = savedPagesIn([...messages.rows.map(row => row.content_json), ...tools.rows.map(row => row.result_json)])

    await client.batch(
        [
            { sql: 'DELETE FROM messages_fts WHERE message_id IN (SELECT id FROM messages WHERE session_id = ?)', args: [sessionId] },
            ...SESSION_ROWS.map(table => ({ sql: `DELETE FROM ${table} WHERE session_id = ?`, args: [sessionId] })),
            { sql: 'DELETE FROM sessions WHERE id = ? AND agent_id = ?', args: [sessionId, ASSISTANT_AGENT_ID] },
        ],
        'write'
    )
    forgetCodexThread(ASSISTANT_AGENT_ID, sessionId)
    forgetClaudeSession(ASSISTANT_AGENT_ID, sessionId)
    for (const page of pages) await removeSavedPage(page)
    return 'deleted'
}
