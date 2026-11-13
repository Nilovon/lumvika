import { existsSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    claudeConfigDir,
    claudeSessionToResume,
    discardTranscript,
    findTranscript,
    forgetClaudeSession,
    forgetClaudeSessionsOf,
    promptHash,
    rememberClaudeSession,
    sweepClaudeTranscripts,
    type ClaudeSession,
} from './claude-sessions.js'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

const sanitized = (path: string) => path.replace(/[^a-zA-Z0-9]/g, '-')
// The removal behind a forget is not awaited by its caller.
const settleDisk = () => new Promise(done => setTimeout(done, 20))

let root: string
let configDir: string
let agentsDir: string
let cwd: string

async function writeTranscript(projectDir: string, claudeSessionId: string): Promise<string> {
    const dir = resolve(configDir, 'projects', projectDir)
    await mkdir(dir, { recursive: true })
    const path = resolve(dir, `${claudeSessionId}.jsonl`)
    await writeFile(path, '{}\n')
    return path
}

function sessionOn(transcriptPath: string, overrides: Partial<ClaudeSession> = {}): ClaudeSession {
    return { claudeSessionId: ID_A, connectionId: 'cnx', model: 'opus', stableHash: promptHash('stable'), volatileHash: promptHash('volatile'), throughMessageId: 'msg-1', transcriptPath, ...overrides }
}

const expected = { connectionId: 'cnx', model: 'opus', stableHash: promptHash('stable'), lastMessageId: 'msg-1' }

beforeEach(async () => {
    root = realpathSync(mkdtempSync(resolve(tmpdir(), 'lumvika-claude-sessions-')))
    configDir = resolve(root, 'claude-home')
    agentsDir = resolve(root, 'data', 'agents')
    cwd = resolve(agentsDir, 'agent-1', 'workspace')
    await mkdir(cwd, { recursive: true })
    forgetClaudeSessionsOf('cnx')
    forgetClaudeSessionsOf('other-cnx')
})

describe('claudeConfigDir', () => {
    it('follows the CLI: its config dir when set, else .claude in its home', () => {
        expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/srv/claude' })).toBe('/srv/claude')
        const saved = process.env.CLAUDE_CONFIG_DIR
        delete process.env.CLAUDE_CONFIG_DIR
        try {
            expect(claudeConfigDir({ HOME: '/home/lumvika' })).toBe('/home/lumvika/.claude')
        } finally {
            if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved
        }
    })
})

describe('findTranscript', () => {
    it('finds it in the project folder named after the working directory', async () => {
        const path = await writeTranscript(sanitized(cwd), ID_A)
        expect(await findTranscript({ configDir, cwd }, ID_A)).toBe(path)
    })

    it('finds it under the real path of a working directory reached through a link', async () => {
        const link = resolve(root, 'link')
        symlinkSync(cwd, link)
        const path = await writeTranscript(sanitized(cwd), ID_A)
        expect(await findTranscript({ configDir, cwd: link }, ID_A)).toBe(path)
    })

    it('looks through every project folder when the name is not the expected one', async () => {
        const path = await writeTranscript('-a-path-too-long-to-keep-whole-12345', ID_A)
        expect(await findTranscript({ configDir, cwd }, ID_A)).toBe(path)
    })

    it('finds nothing in a home with no transcript', async () => {
        expect(await findTranscript({ configDir, cwd }, ID_A)).toBeUndefined()
        expect(await findTranscript({ configDir, cwd: resolve(root, 'gone') }, ID_A)).toBeUndefined()
    })

    it('discards the transcript and its sub-agent folder', async () => {
        const path = await writeTranscript(sanitized(cwd), ID_A)
        await mkdir(path.replace(/\.jsonl$/, ''), { recursive: true })
        await discardTranscript({ configDir, cwd }, ID_A)
        expect(existsSync(path)).toBe(false)
        expect(existsSync(path.replace(/\.jsonl$/, ''))).toBe(false)
        await expect(discardTranscript({ configDir, cwd }, ID_A)).resolves.toBeUndefined()
    })
})

describe('claudeSessionToResume', () => {
    it('hands back the session the conversation left off in', async () => {
        const path = await writeTranscript(sanitized(cwd), ID_A)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(path))
        expect(claudeSessionToResume('agent-1', 'conv-1', expected)?.claudeSessionId).toBe(ID_A)
        expect(claudeSessionToResume('agent-1', 'conv-2', expected)).toBeUndefined()
    })

    it.each([
        ['another account', { connectionId: 'other-cnx' }],
        ['another model', { model: 'sonnet' }],
        ['another stable prompt', { stableHash: promptHash('changed') }],
        ['a message the session never saw', { lastMessageId: 'msg-2' }],
    ])('forgets it, transcript included, on %s', async (_reason, change) => {
        const path = await writeTranscript(sanitized(cwd), ID_A)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(path))
        expect(claudeSessionToResume('agent-1', 'conv-1', { ...expected, ...change })).toBeUndefined()
        await settleDisk()
        expect(existsSync(path)).toBe(false)
        expect(claudeSessionToResume('agent-1', 'conv-1', expected)).toBeUndefined()
    })

    it('forgets it once its transcript is gone', async () => {
        const path = await writeTranscript(sanitized(cwd), ID_A)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(path))
        await rm(path)
        expect(claudeSessionToResume('agent-1', 'conv-1', expected)).toBeUndefined()
    })
})

describe('remembering and forgetting', () => {
    it('drops the transcript of the session a conversation moves away from', async () => {
        const first = await writeTranscript(sanitized(cwd), ID_A)
        const second = await writeTranscript(sanitized(cwd), ID_B)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(first))
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(first, { throughMessageId: 'msg-2' }))
        await settleDisk()
        expect(existsSync(first)).toBe(true)

        rememberClaudeSession('agent-1', 'conv-1', sessionOn(second, { claudeSessionId: ID_B }))
        await settleDisk()
        expect(existsSync(first)).toBe(false)
        expect(existsSync(second)).toBe(true)
    })

    it('forgets a conversation, and every conversation of an account', async () => {
        const first = await writeTranscript(sanitized(cwd), ID_A)
        const second = await writeTranscript(sanitized(cwd), ID_B)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(first))
        rememberClaudeSession('agent-1', 'conv-2', sessionOn(second, { claudeSessionId: ID_B, connectionId: 'other-cnx' }))

        forgetClaudeSession('agent-1', 'conv-1')
        forgetClaudeSessionsOf('cnx')
        await settleDisk()
        expect(existsSync(first)).toBe(false)
        expect(claudeSessionToResume('agent-1', 'conv-2', { ...expected, connectionId: 'other-cnx' })?.claudeSessionId).toBe(ID_B)

        forgetClaudeSessionsOf('other-cnx')
        await settleDisk()
        expect(existsSync(second)).toBe(false)
    })
})

describe('sweepClaudeTranscripts', () => {
    it('removes the transcripts no conversation can resume, in the agent workspaces alone', async () => {
        const kept = await writeTranscript(sanitized(cwd), ID_A)
        const orphan = await writeTranscript(sanitized(cwd), ID_B)
        await mkdir(orphan.replace(/\.jsonl$/, ''), { recursive: true })
        await writeFile(resolve(configDir, 'projects', sanitized(cwd), 'notes.md'), 'kept')
        const elsewhere = await writeTranscript(sanitized(resolve(root, 'someone-else')), ID_B)
        rememberClaudeSession('agent-1', 'conv-1', sessionOn(kept))

        expect(await sweepClaudeTranscripts(configDir, agentsDir)).toBe(2)

        expect(existsSync(kept)).toBe(true)
        expect(existsSync(elsewhere)).toBe(true)
        expect((await readdir(resolve(configDir, 'projects', sanitized(cwd)))).sort()).toEqual([`${ID_A}.jsonl`, 'notes.md'])
    })

    it('forgets the sessions left alone past the life of the prompt cache, transcripts included', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        try {
            const idle = await writeTranscript(sanitized(cwd), ID_A)
            const recent = await writeTranscript(sanitized(cwd), ID_B)
            rememberClaudeSession('agent-1', 'conv-1', sessionOn(idle))
            vi.setSystemTime(Date.now() + 50 * 60_000)
            rememberClaudeSession('agent-1', 'conv-2', sessionOn(recent, { claudeSessionId: ID_B }))
            vi.setSystemTime(Date.now() + 20 * 60_000)

            await sweepClaudeTranscripts(configDir, agentsDir)
            await settleDisk()

            expect(existsSync(idle)).toBe(false)
            expect(claudeSessionToResume('agent-1', 'conv-1', expected)).toBeUndefined()
            expect(existsSync(recent)).toBe(true)
            expect(claudeSessionToResume('agent-1', 'conv-2', expected)?.claudeSessionId).toBe(ID_B)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does nothing in a home the CLI never wrote to', async () => {
        expect(await sweepClaudeTranscripts(configDir, agentsDir)).toBe(0)
    })
})
