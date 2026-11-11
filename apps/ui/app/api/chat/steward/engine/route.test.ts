import { callableEngineAgentIds } from '@/app/api/_auth/access'
import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import { startChat } from '@/lib/chat/start-chat'
import { cancelRun } from '@/lib/engine/client'
import { cancelStewardSessionRuns, loadStewardConversation } from '@/lib/steward/conversation'
import { loadStewardState } from '@/lib/steward/state'
import { resolveStewardSurface } from '@/lib/steward/surface.server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, POST } from './route'

vi.mock('@/app/api/_auth/ownership', () => ({ requireWorkspaceContext: vi.fn() }))
vi.mock('@/app/api/_auth/access', () => ({ actorFromContext: vi.fn(() => ({ kind: 'user', userId: 'user-1', workspaceId: 7, role: 'member', boxScope: 'assigned' })), callableEngineAgentIds: vi.fn() }))
vi.mock('@/lib/steward/hub-token', () => ({ mintStewardHubToken: vi.fn(() => null) }))
vi.mock('@/app/api/_services/me.service', () => ({ messageAuthorOf: vi.fn() }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ getWorkspaceConnection: vi.fn(), NoEngineError: class NoEngineError extends Error {} }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/engine/client', () => ({ cancelRun: vi.fn(), reconnectRun: vi.fn() }))
vi.mock('@/lib/steward/conversation', () => ({
    cancelStewardSessionRuns: vi.fn(),
    engineSessionOf: vi.fn().mockResolvedValue(null),
    loadStewardConversation: vi.fn(),
    readStewardEngineMessages: vi.fn(),
    startEngineConversation: vi.fn(),
    touchStewardConversation: vi.fn(),
}))
vi.mock('@/lib/steward/engine-brief', () => ({ stewardEngineBrief: vi.fn() }))
vi.mock('@/lib/steward/state', () => ({ loadStewardState: vi.fn() }))
vi.mock('@/lib/steward/surface.server', () => ({ resolveStewardSurface: vi.fn() }))

const URL = 'https://lumvika.test/api/chat/steward/engine'
const post = () => new Request(URL, { method: 'POST', body: JSON.stringify({ sessionId: 'session', text: 'ship it' }) })

describe('/api/chat/steward/engine', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(requireWorkspaceContext).mockResolvedValue({ userId: 'user-1', authUser: { isAnonymous: false }, workspace: { id: 7 }, scope: {} } as never)
        vi.mocked(loadStewardState).mockResolvedValue({ phase: 'onboarding' } as never)
        vi.mocked(resolveStewardSurface).mockResolvedValue('hub' as never)
    })

    it('turns away a message from an anonymous visitor', async () => {
        vi.mocked(requireWorkspaceContext).mockResolvedValue({ userId: 'user-1', authUser: { isAnonymous: true }, workspace: { id: 7 }, scope: {} } as never)

        const response = await POST(post())

        expect(response.status).toBe(401)
        expect(loadStewardState).not.toHaveBeenCalled()
    })

    it('lets a message from an account through', async () => {
        const response = await POST(post())

        expect(response.status).toBe(409)
        expect(loadStewardState).toHaveBeenCalledOnce()
    })

    it('reopens the conversation of an account', async () => {
        vi.mocked(loadStewardConversation).mockResolvedValue(null)

        const response = await GET(new Request(URL))

        expect(response.status).toBe(200)
    })

    it('hands the engine the coworkers the member reaches, so call_agent names no other', async () => {
        vi.mocked(resolveStewardSurface).mockResolvedValue('engine' as never)
        vi.mocked(getWorkspaceConnection).mockResolvedValue({ baseUrl: 'https://engine.test', apiKey: null } as never)
        vi.mocked(callableEngineAgentIds).mockResolvedValue(['engine-open'])
        vi.mocked(startChat).mockResolvedValue(new Response('', { status: 500 }))

        await POST(post())

        expect(vi.mocked(startChat).mock.calls[0][2]).toMatchObject({ callableAgentIds: ['engine-open'] })
    })

    it('sweeps the session before stopping the run by name, so a message waiting behind it survives', async () => {
        const order: string[] = []
        vi.mocked(getWorkspaceConnection).mockResolvedValue({ baseUrl: 'https://engine.test', apiKey: null } as never)
        vi.mocked(cancelStewardSessionRuns).mockImplementation(async () => void order.push('session'))
        vi.mocked(cancelRun).mockImplementation(async () => void order.push('run'))

        const response = await DELETE(new Request(`${URL}?runId=run-a&sessionId=session`, { method: 'DELETE' }))

        expect(response.status).toBe(200)
        expect(order).toEqual(['session', 'run'])
        expect(cancelRun).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'run-a')
    })

    it('answers 502 when the sweep fails and no run id is left to stop', async () => {
        vi.mocked(cancelStewardSessionRuns).mockRejectedValue(new Error('engine down'))

        const response = await DELETE(new Request(`${URL}?sessionId=session`, { method: 'DELETE' }))

        expect(response.status).toBe(502)
        expect(cancelRun).not.toHaveBeenCalled()
    })
})
