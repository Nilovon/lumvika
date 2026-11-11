import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { logLumvikaUsage } from '@lumvika/cloud/billing.server'
import { saveStewardConversation } from '@/lib/steward/conversation'
import { prepareScript } from '@/lib/steward/scripted'
import { loadStewardState } from '@/lib/steward/state'
import { createStewardTurn } from '@/lib/steward/turn'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BILLING_ENABLED } from '@lumvika/cloud/billing'
import { POST } from './route'

vi.mock('@/app/api/_auth/ownership', () => ({ requireWorkspaceContext: vi.fn() }))
vi.mock('@lumvika/cloud/billing.server', async importOriginal => ({ ...(await importOriginal<typeof import('@lumvika/cloud/billing.server')>()), logLumvikaUsage: vi.fn() }))
vi.mock('@/lib/steward/conversation', () => ({ engineSessionOf: vi.fn().mockResolvedValue(null), loadStewardConversation: vi.fn(), saveStewardConversation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/steward/state', () => ({ loadStewardState: vi.fn() }))
vi.mock('@/lib/steward/scripted', () => ({ prepareScript: vi.fn(), runScript: vi.fn() }))
vi.mock('@/lib/steward/tools', () => ({ stewardActiveTools: vi.fn(() => []), stewardTools: vi.fn(() => ({})) }))
vi.mock('@/lib/steward/turn', () => ({ createStewardTurn: vi.fn() }))
vi.mock('@/lib/steward/prompt', () => ({ stewardSystemPrompt: vi.fn() }))

const request = (messages: unknown[] = []) => new Request('https://lumvika.test/api/chat/steward', { method: 'POST', body: JSON.stringify({ sessionId: 'session', messages }) })
const hello = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }]

describe('POST /api/chat/steward', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv('LUMVIKA_MAX_API_KEY', 'key')
        vi.mocked(requireWorkspaceContext).mockResolvedValue({ userId: 'user-1', authUser: { isAnonymous: false }, workspace: { id: 7 }, scope: {} } as never)
        vi.mocked(loadStewardState).mockResolvedValue({ phase: 'waitlist' } as never)
    })

    it('turns away an anonymous visitor before reading where the workspace stands', async () => {
        vi.mocked(requireWorkspaceContext).mockResolvedValue({ userId: 'user-1', authUser: { isAnonymous: true }, workspace: { id: 7 }, scope: {} } as never)

        const response = await POST(request())

        expect(response.status).toBe(401)
        expect(loadStewardState).not.toHaveBeenCalled()
    })

    it('lets an account through to the steward', async () => {
        const response = await POST(request())

        expect(response.status).toBe(423)
        expect(loadStewardState).toHaveBeenCalledOnce()
    })

    describe('a turn the model answers', () => {
        const frames = [
            { id: 'gen', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' } }] },
            { id: 'gen', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 4, cost: 0.003 } },
        ]
        const openRouterStream = () => new Response(`${frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')}data: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })

        beforeEach(() => {
            vi.mocked(loadStewardState).mockResolvedValue({ phase: 'plan', answers: {} } as never)
            vi.mocked(prepareScript).mockResolvedValue(null as never)
            vi.mocked(createStewardTurn).mockReturnValue({ state: () => ({ phase: 'plan', steward: {} }) } as never)
        })

        afterEach(() => vi.restoreAllMocks())

        // The onboarding is on the house: there is no credit to check, so none can run out on it.
        it('reaches the model without asking how much credit the workspace has left', async () => {
            const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => openRouterStream())

            const response = await POST(request(hello))
            await response.text()

            expect(response.status).toBe(200)
            expect(fetchMock).toHaveBeenCalledOnce()
        })

        it.skipIf(!BILLING_ENABLED)('logs what the turn cost without taking it off the credit', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async () => openRouterStream())

            await (await POST(request(hello))).text()

            expect(logLumvikaUsage).toHaveBeenCalledWith({ workspaceId: 7, model: 'openai/gpt-6-sol', tier: 'smart', inputTokens: 120, outputTokens: 4, costMicros: 3000 })
        })

        // Two answers once streamed over each other in the browser, which sent the transcript back
        // with every copy: the turn reads and saves each of them once.
        it('saves a transcript whose answers were pushed twice with each answer once', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async () => openRouterStream())
            const doubled = [...hello, { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }, { id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'Hey' }] }, { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] }, { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Again' }] }]

            await (await POST(request(doubled))).text()
            await vi.waitFor(() => expect(saveStewardConversation).toHaveBeenCalledOnce())

            const [, , transcript] = vi.mocked(saveStewardConversation).mock.calls[0]
            expect(transcript.map(message => message.id).slice(0, 4)).toEqual(['m1', 'a', 'b', 'u2'])
            expect(transcript[1].parts).toEqual([{ type: 'text', text: 'Hi there' }])
        })
    })
})
