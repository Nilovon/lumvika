import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/api/_services/workspace-engine.service', () => ({ findWorkspaceEngine: vi.fn(), NoEngineError: class NoEngineError extends Error {} }))
vi.mock('@/lib/engine/client', () => ({ cancelRun: vi.fn(), deleteSession: vi.fn(), getEngineHealth: vi.fn(), getSessionMessages: vi.fn(), listRuns: vi.fn(), reconnectRun: vi.fn() }))

const { cancelRun, deleteSession, getEngineHealth, listRuns } = await import('@/lib/engine/client')
const { eraseAssistantTranscript, ERASE_RETRY_DELAYS_MS } = await import('./assistant-engine.service')

const conn = { baseUrl: 'https://engine.test', apiKey: 'k' }
const health = (capabilities: string[]) => ({ status: 'ok', activeAgents: 0, capabilities }) as never
const CAN_ERASE = health(['assistant', 'assistant.sessions.delete'])
const noWait = vi.fn(async () => {})

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listRuns).mockResolvedValue([])
})

describe('eraseAssistantTranscript', () => {
    it('stops what still runs on the conversation, then erases it', async () => {
        vi.mocked(getEngineHealth).mockResolvedValue(CAN_ERASE)
        vi.mocked(listRuns).mockResolvedValue([{ id: 'run-1', sessionId: 's1', status: 'running' }] as never)
        vi.mocked(cancelRun).mockResolvedValue(undefined as never)
        vi.mocked(deleteSession).mockResolvedValue(Response.json({ ok: true }))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('erased')
        expect(cancelRun).toHaveBeenCalledWith(conn, 'assistant', 'run-1')
        expect(deleteSession).toHaveBeenCalledWith(conn, 'assistant', 's1')
    })

    it('counts a conversation the engine no longer has as erased', async () => {
        vi.mocked(getEngineHealth).mockResolvedValue(CAN_ERASE)
        vi.mocked(deleteSession).mockResolvedValue(Response.json({ error: 'session not found' }, { status: 404 }))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('erased')
    })

    it('tries again while the stopped run still holds the conversation, a few times only', async () => {
        vi.mocked(getEngineHealth).mockResolvedValue(CAN_ERASE)
        const busy = () => Response.json({ code: 'run_in_flight' }, { status: 409 })
        vi.mocked(deleteSession).mockResolvedValueOnce(busy()).mockResolvedValueOnce(Response.json({ ok: true }))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('erased')
        expect(noWait).toHaveBeenCalledWith(ERASE_RETRY_DELAYS_MS[0])

        vi.mocked(deleteSession).mockImplementation(async () => busy())
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('unreachable')
        expect(deleteSession).toHaveBeenCalledTimes(2 + 1 + ERASE_RETRY_DELAYS_MS.length)
    })

    it('leaves the conversation on an engine that cannot erase it', async () => {
        vi.mocked(getEngineHealth).mockResolvedValue(health(['assistant']))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('outdated')
        expect(deleteSession).not.toHaveBeenCalled()
    })

    it('says so when there is no server, it does not answer, or it fails', async () => {
        expect(await eraseAssistantTranscript(null, 's1', noWait)).toBe('unreachable')
        vi.mocked(getEngineHealth).mockRejectedValueOnce(new Error('ECONNREFUSED'))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('unreachable')
        vi.mocked(getEngineHealth).mockResolvedValue(CAN_ERASE)
        vi.mocked(deleteSession).mockResolvedValue(new Response('boom', { status: 500 }))
        expect(await eraseAssistantTranscript(conn, 's1', noWait)).toBe('unreachable')
    })

    it('waits for real between two tries by default', async () => {
        vi.useFakeTimers()
        try {
            vi.mocked(getEngineHealth).mockResolvedValue(CAN_ERASE)
            vi.mocked(deleteSession).mockResolvedValueOnce(Response.json({}, { status: 409 })).mockResolvedValueOnce(Response.json({ ok: true }))
            const outcome = eraseAssistantTranscript(conn, 's1')
            await vi.advanceTimersByTimeAsync(ERASE_RETRY_DELAYS_MS[0])
            expect(await outcome).toBe('erased')
        } finally {
            vi.useRealTimers()
        }
    })
})
