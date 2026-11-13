import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

// The Claude CLI session a conversation can pick up again. Resumed, the CLI reads the turns it
// already holds from its transcript and sends only the new message after them, so its prompt cache
// keeps every earlier turn; replayed, the whole history goes in again as one new block of text that
// no cache holds. Kept in memory: an engine restart costs one replayed message per conversation.
//
// `stableHash` is the system prompt the session was started on: the CLI sends it before every turn,
// so a session never changes it. `volatileHash` is the last workspace state handed to it in a turn.
// `usedTokens` is what the CLI last reported its context holds, which the rows alone undercount.
export type ClaudeSession = {
    claudeSessionId: string
    connectionId: string
    model: string
    stableHash: string
    volatileHash: string
    throughMessageId: string
    transcriptPath: string
    usedTokens?: number
}

// Where the CLI writes its transcripts: `<configDir>/projects/<cwd, sanitized>/<session id>.jsonl`.
export type TranscriptPlace = { configDir: string; cwd: string }

export type ClaudeResumeCheck = { connectionId: string; model: string; stableHash: string; lastMessageId: string | undefined }

const sessions = new Map<string, ClaudeSession & { keptAt: number }>()

const keyOf = (agentId: string, sessionId: string) => `${agentId}:${sessionId}`

export const promptHash = (text: string): string => createHash('sha256').update(text).digest('hex')

// The CLI's own rule: `CLAUDE_CONFIG_DIR`, else `.claude` in the home it runs with.
export function claudeConfigDir(env: Record<string, string | undefined>): string {
    return env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR || resolve(env.HOME || process.env.HOME || homedir(), '.claude')
}

// Past this length the CLI cuts the name and appends a hash of the path, which only a scan finds.
const PROJECT_DIR_NAME_MAX = 200

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const projectDirName = (path: string) => path.replace(/[^a-zA-Z0-9]/g, '-')

function realPath(path: string): string {
    try {
        return realpathSync(path)
    } catch {
        return path
    }
}

export async function findTranscript({ configDir, cwd }: TranscriptPlace, claudeSessionId: string): Promise<string | undefined> {
    const projects = resolve(configDir, 'projects')
    const file = `${claudeSessionId}.jsonl`
    for (const path of new Set([cwd, realPath(cwd)])) {
        const name = projectDirName(path)
        if (name.length > PROJECT_DIR_NAME_MAX) continue
        const candidate = resolve(projects, name, file)
        if (existsSync(candidate)) return candidate
    }
    const dirs = await readdir(projects, { withFileTypes: true }).catch(() => [])
    for (const dir of dirs) {
        const candidate = resolve(projects, dir.name, file)
        if (dir.isDirectory() && existsSync(candidate)) return candidate
    }
    return undefined
}

async function removeTranscript(path: string): Promise<void> {
    await rm(path, { force: true })
    await rm(path.replace(/\.jsonl$/, ''), { recursive: true, force: true })
}

function dropTranscript(path: string | undefined): void {
    if (path) void removeTranscript(path).catch(() => {})
}

export async function discardTranscript(place: TranscriptPlace, claudeSessionId: string): Promise<void> {
    const path = await findTranscript(place, claudeSessionId)
    if (path) await removeTranscript(path)
}

// `throughMessageId` is the last message of the turn the session itself answered. Anything written
// after it (a turn on another provider, a failed or cancelled run) is history the session never
// saw, and a session on another prompt, model or account is not the one this turn would start.
export function claudeSessionToResume(agentId: string, sessionId: string, expected: ClaudeResumeCheck): ClaudeSession | undefined {
    const session = sessions.get(keyOf(agentId, sessionId))
    if (!session) return undefined
    const matches =
        session.connectionId === expected.connectionId &&
        session.model === expected.model &&
        session.stableHash === expected.stableHash &&
        session.throughMessageId === expected.lastMessageId &&
        existsSync(session.transcriptPath)
    if (matches) return session
    forgetClaudeSession(agentId, sessionId)
    return undefined
}

export function rememberClaudeSession(agentId: string, sessionId: string, session: ClaudeSession): void {
    const key = keyOf(agentId, sessionId)
    const previous = sessions.get(key)
    if (previous && previous.transcriptPath !== session.transcriptPath) dropTranscript(previous.transcriptPath)
    sessions.set(key, { ...session, keptAt: Date.now() })
}

export function forgetClaudeSession(agentId: string, sessionId: string): void {
    const key = keyOf(agentId, sessionId)
    dropTranscript(sessions.get(key)?.transcriptPath)
    sessions.delete(key)
}

export function forgetClaudeSessionsOf(connectionId: string): void {
    for (const [key, session] of sessions) {
        if (session.connectionId !== connectionId) continue
        dropTranscript(session.transcriptPath)
        sessions.delete(key)
    }
}

// A session left alone longer than the CLI's prompt cache lives (an hour on a subscription) saves
// nothing over a replay: resumed or started over, its whole prefix is written to the cache again.
// Forgetting it is what keeps a box running a schedule every few minutes, each fire a conversation
// of its own, from piling up transcripts.
export const CLAUDE_SESSION_MAX_IDLE_MS = 3_600_000

// Then the transcripts an engine restart orphaned, and those of turns that failed before their
// session was kept: every one in a project folder of an agent workspace that no conversation can
// resume. Only the engine runs the CLI in those folders. Called with no run in flight, so no
// transcript being written is taken for an orphan.
export async function sweepClaudeTranscripts(configDir: string, agentsDir: string, maxIdleMs = CLAUDE_SESSION_MAX_IDLE_MS): Promise<number> {
    const now = Date.now()
    for (const [key, session] of sessions) {
        if (now - session.keptAt <= maxIdleMs) continue
        dropTranscript(session.transcriptPath)
        sessions.delete(key)
    }
    const projects = resolve(configDir, 'projects')
    const prefixes = [...new Set([agentsDir, realPath(agentsDir)])].map(path => projectDirName(path).slice(0, PROJECT_DIR_NAME_MAX))
    const kept = new Set([...sessions.values()].map(session => session.claudeSessionId))
    let removed = 0
    for (const dir of await readdir(projects, { withFileTypes: true }).catch(() => [])) {
        if (!dir.isDirectory() || !prefixes.some(prefix => dir.name.startsWith(prefix))) continue
        const folder = resolve(projects, dir.name)
        for (const entry of await readdir(folder).catch(() => [])) {
            const id = entry.replace(/\.jsonl$/, '')
            if (!SESSION_ID.test(id) || kept.has(id)) continue
            if (await rm(resolve(folder, entry), { recursive: true, force: true }).then(() => true, () => false)) removed += 1
        }
    }
    return removed
}
