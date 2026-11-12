import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-issue-queue-'))
process.env.LUMVIKA_HUB_BASE_URL = 'https://hub.test/'
process.env.LUMVIKA_API_KEY = 'engine-token'
process.env.LUMVIKA_LOG_LEVEL = 'fatal'

type Agent = { id: string; config: { enabled: boolean; kind?: string; ephemeral?: boolean; tools: { work: boolean } } }

const state = vi.hoisted(() => ({
    agents: {} as Record<string, Agent>,
    inFlight: new Set<string>(),
    woken: {} as Record<string, string[]>,
    fired: [] as Array<{ agentId: string; request: unknown }>,
    fireResult: { started: true } as unknown,
    fireError: null as Error | null,
}))

vi.mock('../agents/registry.js', () => ({
    getAgent: async (id: string) => {
        const agent = state.agents[id]
        if (!agent) throw new Error(`no agent ${id}`)
        return agent
    },
}))
vi.mock('./issue-runner.js', () => ({
    issueRunInFlight: (agentId: string) => state.inFlight.has(agentId),
    issueWokenSince: (agentId: string) => state.woken[agentId] ?? [],
    fireIssueRun: async (agentId: string, request: unknown) => {
        state.fired.push({ agentId, request })
        if (state.fireError) throw state.fireError
        return state.fireResult
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { sweepIssueQueue, sweepIssueQueueIfDue } = await import('./issue-queue.js')
const { registerRunAbort, unregisterRunAbort } = await import('./run-control.js')
const { setEnv } = await import('../config/env.js')

const originalFetch = globalThis.fetch

function mockFetch(respond: () => Response | Promise<Response>) {
    const fn = vi.fn(async (_url: string, _init: RequestInit) => respond())
    globalThis.fetch = fn as unknown as typeof fetch
    return fn
}

function coworker(id: string, extra: Partial<Agent['config']> = {}): Agent {
    return { id, config: { enabled: true, kind: 'user', tools: { work: true }, ...extra } }
}

beforeEach(() => {
    state.agents = {
        writer: coworker('writer'),
        busy: coworker('busy'),
        queued: coworker('queued'),
        off: coworker('off', { enabled: false }),
        noWork: coworker('noWork', { tools: { work: false } }),
        steward: coworker('steward', { kind: 'steward' }),
        clone: coworker('clone', { ephemeral: true }),
        assistant: coworker('assistant', { kind: 'assistant' }),
    }
    state.inFlight = new Set(['queued'])
    state.woken = { writer: ['ENG-3'] }
    state.fired = []
    state.fireResult = { started: true }
    state.fireError = null
    registerRunAbort('run-live', 'busy')
})

afterEach(() => {
    globalThis.fetch = originalFetch
    unregisterRunAbort('run-live')
    vi.useRealTimers()
})

const ALL = ['writer', 'busy', 'queued', 'off', 'noWork', 'steward', 'clone', 'assistant', 'ghost']

describe('sweepIssueQueue', () => {
    it('asks the hub once for the idle coworkers, with the live runs, and starts what it answers', async () => {
        const fetchMock = mockFetch(() => Response.json({ runs: [{ agentId: 'writer', ref: 'ENG-12', title: 'Launch post' }] }))

        await sweepIssueQueue(ALL)

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://hub.test/api/hub/work-queue')
        expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer engine-token' })
        expect(JSON.parse(init.body as string)).toEqual({ coworkers: [{ agentId: 'writer', skipRefs: ['ENG-3'] }], liveRunIds: ['run-live'] })
        expect(state.fired).toEqual([{ agentId: 'writer', request: { ref: 'ENG-12', title: 'Launch post', reason: 'heartbeat' } }])
    })

    it('never starts a run for a coworker it did not offer', async () => {
        mockFetch(() => Response.json({ runs: [{ agentId: 'busy', ref: 'ENG-1', title: 'x' }] }))
        await sweepIssueQueue(ALL)
        expect(state.fired).toEqual([])
    })

    it('keeps going when a run is skipped or fails to start', async () => {
        mockFetch(() => Response.json({ runs: [{ agentId: 'writer', ref: 'ENG-1', title: 'x' }] }))
        state.fireResult = { started: false, reason: 'budget_latched' }
        await sweepIssueQueue(ALL)
        state.fireError = new Error('boom')
        await expect(sweepIssueQueue(ALL)).resolves.toBeUndefined()
        expect(state.fired).toHaveLength(2)
    })

    it('does nothing against a hub that predates the queue or fails', async () => {
        mockFetch(() => new Response('Not found', { status: 404 }))
        await sweepIssueQueue(ALL)
        mockFetch(() => new Response('oops', { status: 500 }))
        await sweepIssueQueue(ALL)
        expect(state.fired).toEqual([])
    })

    it('stays quiet on a box with no coworker', async () => {
        const fetchMock = mockFetch(() => Response.json({ runs: [] }))
        await sweepIssueQueue([])
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('stays quiet on a box that is not linked to a hub', async () => {
        const fetchMock = mockFetch(() => Response.json({ runs: [] }))
        setEnv({ LUMVIKA_HUB_BASE_URL: '' })
        try {
            await sweepIssueQueue(ALL)
        } finally {
            setEnv({ LUMVIKA_HUB_BASE_URL: 'https://hub.test/' })
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('sweepIssueQueueIfDue', () => {
    it('sweeps at most every five minutes, and survives a failing hub', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z') })
        const fetchMock = mockFetch(() => {
            throw new Error('unreachable')
        })
        await sweepIssueQueueIfDue(ALL)
        await sweepIssueQueueIfDue(ALL)
        expect(fetchMock).toHaveBeenCalledTimes(1)

        vi.setSystemTime(new Date('2026-11-12T10:05:00Z'))
        await sweepIssueQueueIfDue(ALL)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('never overlaps a sweep still waiting on the hub', async () => {
        vi.useFakeTimers({ now: new Date('2026-11-12T11:00:00Z') })
        let answer!: (res: Response) => void
        const fetchMock = mockFetch(() => new Promise<Response>(resolve => (answer = resolve)))
        const first = sweepIssueQueueIfDue(ALL)
        await vi.advanceTimersByTimeAsync(0)
        vi.setSystemTime(new Date('2026-11-12T11:10:00Z'))
        await sweepIssueQueueIfDue(ALL)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        answer(Response.json({ runs: [] }))
        await first
    })
})
