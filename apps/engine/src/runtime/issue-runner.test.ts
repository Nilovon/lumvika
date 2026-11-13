import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-issue-runner-'))
process.env.LUMVIKA_API_KEY = ''
process.env.LUMVIKA_LOG_LEVEL = 'fatal'

type Outcome = { kind: 'done' | 'error' | 'cancelled'; error?: string }
type Agent = { id: string; config: { enabled: boolean; kind?: string; ephemeral?: boolean; tools: { work: boolean } } }

const state = vi.hoisted(() => ({
    agents: {} as Record<string, Agent>,
    override: { provider: 'lumvika', model: 'm' } as { provider: string; model: string; connectionId?: string },
    computer: false,
    sessions: 0,
    sent: [] as Array<Record<string, unknown>>,
    launchError: null as Error | null,
    runs: [] as Array<{ agentId: string; sessionId: string; message: string; trigger: unknown; finish: (o: Outcome) => void }>,
}))

vi.mock('../agents/availability.js', () => ({ resolveAutomationModel: async () => state.override }))
vi.mock('../tools/builtin/computer.js', () => ({ offersComputer: () => state.computer }))
vi.mock('../agents/registry.js', () => ({
    getAgent: async (id: string) => {
        const agent = state.agents[id]
        if (!agent) throw new Error(`no agent ${id}`)
        return agent
    },
}))
vi.mock('../db/repos/sessions.js', () => ({
    createSession: async (_agentId: string, title: string, _origin: unknown, source: string) => ({ id: `sess-${++state.sessions}`, title, source }),
}))
vi.mock('./notify.js', () => ({
    sendNotification: async (input: Record<string, unknown>) => {
        state.sent.push(input)
        return { delivered: true }
    },
}))
vi.mock('./headless-run.js', () => ({
    startHeadlessRun: async (agent: { id: string }, sessionId: string, message: string, _override: unknown, trigger: unknown) => {
        if (state.launchError) throw state.launchError
        let finish!: (o: Outcome) => void
        const settled = new Promise<Outcome>(r => (finish = r))
        state.runs.push({ agentId: agent.id, sessionId, message, trigger, finish })
        return { runId: `run-${state.runs.length}`, settled }
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { buildIssueRunMessage, fireIssueRun, issueRunInFlight, issueWakesSince, rememberedWakeCount, WOKEN_MEMORY_MS } = await import('./issue-runner.js')
const { armBudgetLatch, clearBudgetLatch } = await import('./budget-latch.js')
const { armPlanLimitLatch, clearPlanLimitLatch } = await import('../connections/plan-limits.js')
const { registerRunAbort, unregisterRunAbort } = await import('./run-control.js')

const request = { ref: 'ENG-12', title: 'Write the launch post', reason: 'assigned' as const }

const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
}

function coworker(id: string, extra: Partial<Agent['config']> = {}): Agent {
    return { id, config: { enabled: true, kind: 'user', tools: { work: true }, ...extra } }
}

beforeEach(() => {
    state.agents = { writer: coworker('writer') }
    state.override = { provider: 'lumvika', model: 'm' }
    state.computer = false
    state.launchError = null
})

afterEach(async () => {
    for (const run of state.runs) run.finish({ kind: 'done' })
    await flush()
    state.runs = []
    state.sent = []
    clearBudgetLatch()
    clearPlanLimitLatch('claude-sub')
    unregisterRunAbort('live-chat')
})

describe('fireIssueRun', () => {
    it('opens an issue conversation, announces it and starts the run on the issue', async () => {
        const outcome = await fireIssueRun('writer', request)

        expect(outcome).toEqual({ started: true, runId: 'run-1', sessionId: 'sess-1' })
        expect(state.sent).toEqual([expect.objectContaining({ event: 'agent.session.created', agentId: 'writer', sessionId: 'sess-1', source: 'issue', title: 'ENG-12: Write the launch post' })])
        expect(state.runs[0]).toMatchObject({ agentId: 'writer', sessionId: 'sess-1', trigger: { source: 'issue', slug: 'ENG-12', name: 'Write the launch post' } })
        expect(state.runs[0].message).toContain('work_checkout ENG-12')
        expect(issueRunInFlight('writer')).toBe(true)
        expect(issueWakesSince('writer', Date.now() - 1000)).toEqual([{ ref: 'ENG-12', at: expect.any(Number) }])
    })

    it('runs one issue at a time per coworker, and frees the coworker when the run settles', async () => {
        await fireIssueRun('writer', request)
        expect(await fireIssueRun('writer', { ...request, ref: 'ENG-13' })).toEqual({ started: false, reason: 'busy', runId: 'run-1' })

        state.runs[0].finish({ kind: 'error', error: 'model down' })
        await flush()
        expect(issueRunInFlight('writer')).toBe(false)
        expect((await fireIssueRun('writer', { ...request, ref: 'ENG-13' })).started).toBe(true)
    })

    it('lets only one of two wakes arriving together start a run', async () => {
        const [first, second] = await Promise.all([fireIssueRun('writer', request), fireIssueRun('writer', request)])
        expect([first.started, second.started].sort()).toEqual([false, true])
        expect(state.runs).toHaveLength(1)
    })

    it.each([
        ['disabled', { enabled: false }],
        ['work_off', { tools: { work: false } }],
        ['not_a_coworker', { kind: 'steward' }],
        ['not_a_coworker', { kind: 'assistant' }],
        ['not_a_coworker', { ephemeral: true }],
    ] as const)('skips with %s', async (reason, config) => {
        state.agents.writer = coworker('writer', config as Partial<Agent['config']>)
        expect(await fireIssueRun('writer', request)).toEqual({ started: false, reason })
        expect(state.runs).toHaveLength(0)
    })

    it('waits for a live run of a coworker that drives a screen', async () => {
        registerRunAbort('live-chat', 'writer')
        state.computer = true
        expect(await fireIssueRun('writer', request)).toEqual({ started: false, reason: 'busy' })
        state.computer = false
        expect((await fireIssueRun('writer', request)).started).toBe(true)
    })

    it('holds off while the Lumvika budget or the subscription is latched', async () => {
        armBudgetLatch()
        expect(await fireIssueRun('writer', request)).toEqual({ started: false, reason: 'budget_latched' })
        state.override = { provider: 'claude', model: 'sonnet', connectionId: 'claude-sub' }
        armPlanLimitLatch('claude-sub')
        expect(await fireIssueRun('writer', request)).toEqual({ started: false, reason: 'subscription_limited' })
        expect(state.runs).toHaveLength(0)
    })

    it('forgets wakes older than it needs, so its memory stays bounded', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        const start = Date.now()
        for (let n = 1; n <= 5; n++) {
            await fireIssueRun('writer', { ...request, ref: `OLD-${n}` })
            state.runs.at(-1)!.finish({ kind: 'done' })
            await flush()
        }
        vi.setSystemTime(start + WOKEN_MEMORY_MS + 1000)
        await fireIssueRun('writer', request)
        expect(issueWakesSince('writer', 0).map(wake => wake.ref)).toEqual(['ENG-12'])
        expect(rememberedWakeCount()).toBe(1)
        vi.useRealTimers()
    })

    it('frees the coworker when the run cannot start', async () => {
        state.launchError = new Error('no model')
        await expect(fireIssueRun('writer', request)).rejects.toThrow('no model')
        expect(issueRunInFlight('writer')).toBe(false)
    })
})

describe('buildIssueRunMessage', () => {
    it('says why the coworker is woken and how to work the issue', () => {
        const message = buildIssueRunMessage({ ...request, reason: 'ready' })
        expect(message).toContain('Work on issue ENG-12: "Write the launch post".')
        expect(message).toContain('moved from the backlog to todo')
        expect(message).toContain('work_get_issue ENG-12')
        expect(message).toContain('in_review')
    })

    it('quotes the comment a person left', () => {
        const message = buildIssueRunMessage({ ...request, reason: 'comment', note: 'Shorter please\nand in French' })
        expect(message).toContain('A person just commented on it.')
        expect(message).toContain('> Shorter please\n> and in French')
    })

    it('tells a run woken on an issue in review to answer rather than take it, and to stop on an issue taken away', () => {
        const message = buildIssueRunMessage({ ...request, reason: 'comment', note: 'Why this title?' })
        expect(message).toContain('If it is in_review, a person is checking your work: answer the comment its reviewNote names with work_comment')
        expect(message).toContain('reassigned or moved by someone else, stop')
    })

    it('words every reason', () => {
        for (const reason of ['assigned', 'reopened', 'heartbeat'] as const) expect(buildIssueRunMessage({ ...request, reason }).split('\n')[0]).toMatch(/ENG-12.*\. \S/)
    })
})
