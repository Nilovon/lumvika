import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-claude-session-'))
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-claude-home-'))

type Prompt = Array<{ role: string; content: unknown }>
type Call = { system?: string; claudeSession?: { id: string; resume: boolean }; prompt: Prompt }

const { calls, turn, run, prompt } = vi.hoisted(() => ({
    calls: [] as Call[],
    turn: { fail: false, reply: 'ok', usedTokens: 1_000, writeTranscript: true, reportedId: undefined as string | undefined },
    run: { model: 'claude-opus-4-8' },
    prompt: { stable: '<identity>\nYou are a test coworker.\n</identity>', volatile: '<memory_index>\n- likes tea\n</memory_index>' },
}))

vi.mock('./notify.js', async importOriginal => ({ ...(await importOriginal<typeof import('./notify.js')>()), sendNotification: async () => ({ delivered: true }) }))
vi.mock('../tools/registry.js', () => ({ buildTools: async () => ({ tools: {}, close: async () => {} }) }))
vi.mock('../connections/cli-auth.js', () => ({ ensureCliAuth: async () => () => {} }))
vi.mock('../agents/availability.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../agents/availability.js')>()),
    resolveRunModel: async () => ({ provider: 'claude', model: run.model, connection: { id: 'claude-cnx', provider: 'claude', env: {}, config: {} } }),
}))
vi.mock('../agents/systemPrompt.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../agents/systemPrompt.js')>()),
    buildSystemPrompt: async () => ({ ...prompt }),
}))

vi.mock('../agents/providers.js', async importOriginal => {
    const actual = await importOriginal<typeof import('../agents/providers.js')>()
    const { MockLanguageModelV3 } = await import('ai/test')
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    return {
        ...actual,
        resolveModel: (agent: Parameters<typeof actual.resolveModel>[0], _override: unknown, _tools: unknown, _mcp: unknown, options: Omit<Call, 'prompt'> = {}) => ({
            model: new MockLanguageModelV3({
                doStream: async ({ prompt: sent }: { prompt: Prompt }) => {
                    calls.push({ system: options.system, claudeSession: options.claudeSession && { ...options.claudeSession }, prompt: sent })
                    if (turn.fail) throw new Error('claude crashed')
                    const id = options.claudeSession!.id
                    if (turn.writeTranscript) {
                        const { configDir, cwd } = actual.claudeTranscriptPlace(agent)
                        const path = resolve(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`)
                        await mkdir(dirname(path), { recursive: true })
                        await writeFile(path, '{}\n', { flag: 'a' })
                    }
                    return {
                        stream: new ReadableStream({
                            start(controller) {
                                controller.enqueue({ type: 'stream-start', warnings: [] })
                                controller.enqueue({ type: 'text-start', id: '0' })
                                controller.enqueue({ type: 'text-delta', id: '0', delta: turn.reply })
                                controller.enqueue({ type: 'text-end', id: '0' })
                                controller.enqueue({
                                    type: 'finish',
                                    finishReason: { unified: 'stop', raw: 'end_turn' },
                                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                                    providerMetadata: { 'claude-code': { sessionId: turn.reportedId ?? id } },
                                })
                                controller.close()
                            },
                        }),
                    }
                },
            }),
            close: async () => {},
            contextUsage: () => ({ usedTokens: turn.usedTokens, maxTokens: 200_000 }),
            quickReplies: () => undefined,
        }),
    }
})

const { beforeAll, beforeEach, describe, expect, it } = await import('vitest')
const { mkdir, rm } = await import('node:fs/promises')
const { migrate } = await import('../db/migrate.js')
const { agentConfigSchema } = await import('../agents/types.js')
const { writeAgentConfig } = await import('../agents/config-write.js')
const { agentDir } = await import('../config/paths.js')
const { getAgent } = await import('../agents/registry.js')
const { createSession } = await import('../db/repos/sessions.js')
const { appendMessage } = await import('../db/repos/messages.js')
const { findTranscript, forgetClaudeSessionsOf } = await import('../agents/claude-sessions.js')
const { claudeTranscriptPlace } = await import('../agents/providers.js')
const { runAgent } = await import('./loop.js')

const id = 'claudesessionagent'
const STABLE = '<identity>\nYou are a test coworker.\n</identity>'
const VOLATILE = '<memory_index>\n- likes tea\n</memory_index>'

async function send(sessionId: string, message: string) {
    const agentRun = await runAgent(await getAgent(id), sessionId, message)
    return agentRun.settled
}

const texts = (content: unknown): string[] => (typeof content === 'string' ? [content] : (content as Array<{ type: string; text?: string }>).flatMap(part => (part.type === 'text' && part.text ? [part.text] : [])))
const promptText = (call: Call) => call.prompt.flatMap(message => texts(message.content)).join('\n')
const userTurns = (call: Call) => call.prompt.filter(message => message.role === 'user')
const resumes = () => calls.map(call => call.claudeSession?.resume)
const transcriptOf = async (claudeSessionId: string) => findTranscript(claudeTranscriptPlace(await getAgent(id)), claudeSessionId)
// The drop is fire and forget: a turn settles without waiting on the disk.
const settleDisk = () => new Promise(done => setTimeout(done, 50))

describe('a Claude CLI conversation keeps its session', () => {
    beforeAll(async () => {
        await migrate()
        await mkdir(agentDir(id), { recursive: true })
        await writeAgentConfig(id, agentConfigSchema.parse({ name: 'claude session', provider: 'claude', model: 'claude-opus-4-8' }))
    })

    beforeEach(() => {
        calls.length = 0
        Object.assign(turn, { fail: false, reply: 'ok', usedTokens: 1_000, writeTranscript: true, reportedId: undefined })
        run.model = 'claude-opus-4-8'
        Object.assign(prompt, { stable: STABLE, volatile: VOLATILE })
        forgetClaudeSessionsOf('claude-cnx')
    })

    it('replays the history to start a session, then sends only the new message to it', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        await send(session.id, 'and then?')
        await send(session.id, 'one more')

        expect(resumes()).toEqual([false, true, true])
        const [first, second, third] = calls
        expect(second!.claudeSession!.id).toBe(first!.claudeSession!.id)
        expect(third!.claudeSession!.id).toBe(first!.claudeSession!.id)
        expect(second!.prompt).toHaveLength(1)
        expect(promptText(second!)).toContain('and then?')
        expect(promptText(second!)).not.toContain('hello')
        expect(third!.prompt).toHaveLength(1)
        expect(promptText(third!)).not.toContain('and then?')
    })

    it('keeps the volatile block out of the system prompt and hands it over in a turn, again only once it changes', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        await send(session.id, 'and then?')
        prompt.volatile = '<memory_index>\n- likes tea\n- hates coffee\n</memory_index>'
        await send(session.id, 'noted?')

        expect(calls.map(call => call.system)).toEqual([STABLE, STABLE, STABLE])
        expect(resumes()).toEqual([false, true, true])
        expect(promptText(calls[0]!)).toContain('<workspace_state>')
        expect(promptText(calls[0]!)).toContain('- likes tea')
        expect(promptText(calls[1]!)).not.toContain('<workspace_state>')
        expect(promptText(calls[2]!)).toContain('- hates coffee')
    })

    it('makes one model call per turn, so the provider never resumes a session on its own', async () => {
        const session = await createSession(id, 'hello')
        for (const message of ['one', 'two', 'three', 'four']) await send(session.id, message)
        expect(calls).toHaveLength(4)
    })

    it('starts a new session from the full history once a message the session never saw lands in the conversation', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        const first = calls[0]!.claudeSession!.id
        await appendMessage(id, session.id, { role: 'assistant', content: 'an answer from another provider' })
        await send(session.id, 'and then?')
        await settleDisk()

        expect(resumes()).toEqual([false, false])
        expect(calls[1]!.claudeSession!.id).not.toBe(first)
        expect(promptText(calls[1]!)).toContain('an answer from another provider')
        expect(await transcriptOf(first)).toBeUndefined()
    })

    it('starts a new session after a turn that failed, and drops the transcript of the failed one', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        const first = calls[0]!.claudeSession!.id
        turn.fail = true
        await send(session.id, 'this one breaks')
        turn.fail = false
        await send(session.id, 'again')
        await settleDisk()

        expect(resumes()).toEqual([false, true, false])
        expect(userTurns(calls[2]!).length).toBeGreaterThan(1)
        expect(await transcriptOf(first)).toBeUndefined()
    })

    it('starts a new session once the stable prompt changes', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        prompt.stable = `${STABLE}\n\n<verbosity>\nBe brief.\n</verbosity>`
        await send(session.id, 'and then?')

        expect(resumes()).toEqual([false, false])
        expect(calls[1]!.system).toContain('Be brief.')
    })

    it('starts a new session on another model', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        run.model = 'claude-sonnet-4-6'
        await send(session.id, 'and then?')
        expect(resumes()).toEqual([false, false])
    })

    it('replays the history when the transcript is gone, as after a restore elsewhere', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        const path = await transcriptOf(calls[0]!.claudeSession!.id)
        expect(path).toBeDefined()
        await rm(path!)
        await send(session.id, 'and then?')

        expect(resumes()).toEqual([false, false])
        expect(promptText(calls[1]!)).toContain('hello')
    })

    it('keeps no session the CLI answered a resume from with another one', async () => {
        const session = await createSession(id, 'hello')
        await send(session.id, 'hello')
        turn.reportedId = '44444444-4444-4444-8444-444444444444'
        await send(session.id, 'and then?')
        turn.reportedId = undefined
        await send(session.id, 'still there?')
        expect(resumes()).toEqual([false, true, false])
    })

    it('keeps no session the CLI wrote no transcript for', async () => {
        const session = await createSession(id, 'hello')
        turn.writeTranscript = false
        await send(session.id, 'hello')
        turn.writeTranscript = true
        await send(session.id, 'and then?')
        expect(resumes()).toEqual([false, false])
    })

    it('drops a session about to outgrow the context window, since the CLI does not compact it', async () => {
        const session = await createSession(id, 'hello')
        turn.usedTokens = 160_000
        await send(session.id, 'hello')
        turn.usedTokens = 1_000
        await send(session.id, 'and then?')
        await settleDisk()

        expect(resumes()).toEqual([false, false])
        expect(await transcriptOf(calls[0]!.claudeSession!.id)).toBeUndefined()
    })

    it('sends a prompt that stays flat across turns where a replay grows with the conversation', async () => {
        const reply = 'A long answer about the quarterly report. '.repeat(40)
        turn.reply = reply
        const resumed = await createSession(id, 'resumed')
        for (const message of ['first', 'second', 'third', 'fourth']) await send(resumed.id, message)
        const resumedChars = calls.map(call => promptText(call).length)

        calls.length = 0
        const replayed = await createSession(id, 'replayed')
        for (const message of ['first', 'second', 'third', 'fourth']) {
            await send(replayed.id, message)
            forgetClaudeSessionsOf('claude-cnx')
        }
        const replayedChars = calls.map(call => promptText(call).length)

        process.stderr.write(`prompt chars per turn, resumed: ${resumedChars.join(', ')}; replayed: ${replayedChars.join(', ')}\n`)
        expect(resumedChars[3]).toBeLessThan(resumedChars[0]!)
        expect(replayedChars[3]).toBeGreaterThan(replayedChars[0]! + 3 * reply.length)
        expect(resumedChars.slice(1).every(chars => chars < 1_000)).toBe(true)
    })
})
