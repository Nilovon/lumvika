import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_auth/ownership', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/ownership')>()), requireWorkspaceContext: vi.fn() }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ findWorkspaceEngine: vi.fn(), NoEngineError: class NoEngineError extends Error {} }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/engine/client', () => ({ cancelRun: vi.fn(), reconnectRun: vi.fn(), listRuns: vi.fn(), getEngineHealth: vi.fn(), getSessionMessages: vi.fn(), getRunSteps: vi.fn() }))
vi.mock('@/lib/ai/generate-title', () => ({ generateSessionTitle: vi.fn(async () => 'Pricing ideas') }))
vi.mock('next/server', () => ({ after: (task: () => unknown) => void task() }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { requireWorkspaceContext } = await import('@/app/api/_auth/ownership')
const { findWorkspaceEngine } = await import('@/app/api/_services/workspace-engine.service')
const { startChat } = await import('@/lib/chat/start-chat')
const { cancelRun, listRuns, reconnectRun } = await import('@/lib/engine/client')
const { DELETE, POST } = await import('./route')
const { GET: RESUME } = await import('./resume/route')

const WORKSPACE = 7
const conn = { baseUrl: 'https://engine.test', apiKey: 'engine-key' }

function chat(overrides: Row = {}): Row {
    return { id: 'chat-1', workspace_id: WORKSPACE, user_id: 'me', project_id: null, title: 'New chat', engine_session_id: null, model: null, shared: false, last_message_at: null, archived_at: null, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', ...overrides }
}

function setup(tables: Partial<Tables> = {}, userId = 'me') {
    const rows: Tables = { assistant_chats: [chat()], projects: [{ id: 'open', workspace_id: WORKSPACE, name: 'Operations', visibility: 'workspace', instructions: 'Answer in bullet points.' }, { id: 'secret', workspace_id: WORKSPACE, name: 'Secret', visibility: 'restricted', instructions: 'Never share this.' }], project_members: [], ...tables }
    const db = workDatabase(rows)
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    vi.mocked(requireWorkspaceContext).mockResolvedValue({ userId, role: 'member', boxScope: 'all', authUser: { is_anonymous: false, user_metadata: { full_name: 'Ada' } }, workspace: { id: WORKSPACE }, supabase: db.client } as never)
    vi.mocked(findWorkspaceEngine).mockResolvedValue({ instanceId: 'i', conn, managed: true })
    return { rows }
}

function stream(text = 'data: {"type":"start"}\n\n', headers: Record<string, string> = {}) {
    return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream', 'x-session-id': 'engine-session', 'x-run-id': 'run-1', ...headers } })
}

const post = (body: unknown) => new Request('https://lumvika.test/api/chat/assistant', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/chat/assistant', () => {
    it('turns away a caller who is not signed in, and a body without a message', async () => {
        setup()
        vi.mocked(requireWorkspaceContext).mockRejectedValueOnce(new Error('no session'))
        expect((await POST(post({ chatId: 'chat-1', text: 'hi' }))).status).toBe(401)
        expect((await POST(post({ chatId: 'chat-1', text: '  ' }))).status).toBe(400)
        expect((await POST(new Request('https://lumvika.test/api/chat/assistant', { method: 'POST', body: '{' }))).status).toBe(400)
    })

    it("refuses someone else's private chat as if it did not exist", async () => {
        setup({}, 'teammate')
        const res = await POST(post({ chatId: 'chat-1', text: 'what did you say to them?' }))
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: 'assistantChatNotFound' })
        expect(startChat).not.toHaveBeenCalled()
    })

    it('keeps a shared chat read-only for everyone but its owner', async () => {
        setup({ assistant_chats: [chat({ shared: true })] }, 'teammate')
        const res = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: 'assistantChatReadOnly' })
        expect(startChat).not.toHaveBeenCalled()
    })

    it('streams the answer, keeps the conversation on the row and names the chat', async () => {
        const { rows } = setup({ assistant_chats: [chat({ project_id: 'open' })] })
        vi.mocked(startChat).mockResolvedValue(stream('data: {"type":"text-delta","delta":"Hello"}\n\n'))

        const res = await POST(post({ chatId: 'chat-1', text: 'Ideas for pricing?', connectionId: 'lumvika', model: 'lumvika-max' }))

        expect(res.status).toBe(200)
        expect(res.headers.get('X-Run-Id')).toBe('run-1')
        expect(await res.text()).toContain('Hello')
        const [engineConn, agentId, params] = vi.mocked(startChat).mock.calls[0]
        expect(engineConn).toBe(conn)
        expect(agentId).toBe('assistant')
        expect(params).toMatchObject({ message: 'Ideas for pricing?', connectionId: 'lumvika', model: 'lumvika-max', author: { id: 'me' }, assistant: { project: { name: 'Operations', instructions: 'Answer in bullet points.' } } })
        expect(params.sessionId).toBeUndefined()
        await vi.waitFor(() => expect(rows.assistant_chats[0].title).toBe('Pricing ideas'))
        expect(rows.assistant_chats[0]).toMatchObject({ engine_session_id: 'engine-session', model: 'lumvika-max' })
    })

    it('continues the engine conversation, without the instructions of a project the owner no longer sees', async () => {
        const { rows } = setup({ assistant_chats: [chat({ engine_session_id: 'engine-session', project_id: 'secret', title: 'Mine' })] })
        vi.mocked(startChat).mockResolvedValue(stream())

        await POST(post({ chatId: 'chat-1', text: 'And then?' }))

        expect(vi.mocked(startChat).mock.calls[0][2]).toMatchObject({ sessionId: 'engine-session', assistant: {} })
        expect(JSON.stringify(vi.mocked(startChat).mock.calls[0][2])).not.toContain('Never share this.')
        expect(rows.assistant_chats[0].title).toBe('Mine')
    })

    it('lets the first of two first sends name the conversation, and continues the second there', async () => {
        const { rows } = setup()
        vi.mocked(listRuns).mockResolvedValue([{ id: 'run-loser', sessionId: 'loser-session', status: 'running' }] as never)
        vi.mocked(startChat)
            .mockImplementationOnce(async () => {
                rows.assistant_chats[0].engine_session_id = 'winner-session'
                return stream('data: {"type":"start"}\n\n', { 'x-session-id': 'loser-session', 'x-run-id': 'run-loser' })
            })
            .mockResolvedValueOnce(stream('data: {"type":"text-delta","delta":"Hi"}\n\n', { 'x-session-id': 'winner-session', 'x-run-id': 'run-2' }))

        const res = await POST(post({ chatId: 'chat-1', text: 'Second tab' }))

        expect(res.status).toBe(200)
        expect(res.headers.get('X-Run-Id')).toBe('run-2')
        expect(vi.mocked(startChat).mock.calls[1][2]).toMatchObject({ sessionId: 'winner-session', message: 'Second tab' })
        expect(rows.assistant_chats[0].engine_session_id).toBe('winner-session')
        await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledWith(conn, 'assistant', 'run-loser'))
    })

    it('stops the run of a first turn when Stop was pressed before the engine named its conversation', async () => {
        const { rows } = setup()
        vi.mocked(listRuns).mockResolvedValue([{ id: 'run-1', sessionId: 'engine-session', status: 'running' }] as never)
        vi.mocked(cancelRun).mockResolvedValue(undefined as never)
        vi.mocked(startChat).mockImplementationOnce(async () => {
            expect((await DELETE(new Request('https://lumvika.test/api/chat/assistant?chatId=chat-1', { method: 'DELETE' }))).status).toBe(200)
            expect(cancelRun).not.toHaveBeenCalled()
            return stream()
        })

        await POST(post({ chatId: 'chat-1', text: 'Ideas for pricing?' }))

        expect(rows.assistant_chats[0].stop_requested_at).toEqual(expect.any(String))
        expect(cancelRun).toHaveBeenCalledExactlyOnceWith(conn, 'assistant', 'run-1')
    })

    it('leaves a turn alone when the last Stop came before it', async () => {
        setup({ assistant_chats: [chat({ stop_requested_at: '2026-11-01T00:00:00.000Z' })] })
        vi.mocked(startChat).mockResolvedValueOnce(stream())
        await POST(post({ chatId: 'chat-1', text: 'Next one' }))
        expect(cancelRun).not.toHaveBeenCalled()
    })

    it('says so when the workspace has no server, or the server does not answer', async () => {
        setup()
        vi.mocked(findWorkspaceEngine).mockResolvedValueOnce(null)
        const none = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect([none.status, await none.json()]).toEqual([409, { error: 'no_engine' }])

        vi.mocked(startChat).mockRejectedValueOnce(new Error('ECONNREFUSED'))
        const down = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect([down.status, await down.json()]).toEqual([502, { error: 'engine_unreachable' }])
    })

    it('asks for an update when the engine predates the assistant', async () => {
        setup()
        vi.mocked(startChat).mockResolvedValue(Response.json({ error: 'agent not found' }, { status: 404 }))
        const res = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect([res.status, await res.json()]).toEqual([409, { error: 'engine_outdated' }])
    })

    it('offers a new chat when the engine lost the conversation, and passes any other failure on', async () => {
        setup({ assistant_chats: [chat({ engine_session_id: 'gone' })] })
        vi.mocked(startChat).mockResolvedValueOnce(Response.json({ error: 'session not found for this agent' }, { status: 404 }))
        expect(await (await POST(post({ chatId: 'chat-1', text: 'hi' }))).json()).toEqual({ error: 'session_not_found' })

        vi.mocked(startChat).mockResolvedValueOnce(new Response('boom', { status: 500 }))
        const res = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect(res.status).toBe(502)
    })

    it('follows the run already answering instead of starting a second one', async () => {
        setup()
        vi.mocked(startChat).mockImplementation(async () => Response.json({ error: 'busy', runId: 'run-0' }, { status: 409 }))
        vi.mocked(reconnectRun).mockResolvedValue(stream())
        const res = await POST(post({ chatId: 'chat-1', text: 'hi' }))
        expect(res.status).toBe(200)
        expect(res.headers.get('X-Run-Id')).toBe('run-0')
        expect(reconnectRun).toHaveBeenCalledWith(conn, 'assistant', 'run-0')

        const queued = await POST(post({ chatId: 'chat-1', text: 'hi', queued: true }))
        expect([queued.status, await queued.json()]).toEqual([409, { error: 'run_in_flight', runId: 'run-0', startedAt: null }])

        vi.mocked(reconnectRun).mockResolvedValue(new Response(null, { status: 204 }))
        expect((await POST(post({ chatId: 'chat-1', text: 'hi' }))).status).toBe(409)
    })
})

describe('DELETE /api/chat/assistant', () => {
    const del = (chatId?: string) => new Request(`https://lumvika.test/api/chat/assistant${chatId ? `?chatId=${chatId}` : ''}`, { method: 'DELETE' })

    it("stops the runs of the owner's chat only", async () => {
        setup({ assistant_chats: [chat({ engine_session_id: 'engine-session' })] })
        vi.mocked(listRuns).mockResolvedValue([{ id: 'run-1', sessionId: 'engine-session', status: 'running' }, { id: 'run-x', sessionId: 'other', status: 'running' }] as never)
        vi.mocked(cancelRun).mockResolvedValue(undefined as never)
        expect((await DELETE(del('chat-1'))).status).toBe(200)
        expect(cancelRun).toHaveBeenCalledExactlyOnceWith(conn, 'assistant', 'run-1')
        expect((await DELETE(del())).status).toBe(400)
    })

    it('has nothing to stop on a chat that never reached the engine, and refuses a foreign one', async () => {
        setup()
        expect((await DELETE(del('chat-1'))).status).toBe(200)
        expect(listRuns).not.toHaveBeenCalled()
        setup({ assistant_chats: [chat({ engine_session_id: 'engine-session' })] }, 'teammate')
        expect((await DELETE(del('chat-1'))).status).toBe(404)
        expect(cancelRun).not.toHaveBeenCalled()
    })
})

describe('GET /api/chat/assistant/resume', () => {
    const resume = (chatId = 'chat-1') => new Request(`https://lumvika.test/api/chat/assistant/resume?chatId=${chatId}`)

    it('replays the run in flight on a chat the caller may read', async () => {
        setup({ assistant_chats: [chat({ engine_session_id: 'engine-session', shared: true })] }, 'teammate')
        vi.mocked(listRuns).mockResolvedValue([{ id: 'run-1', sessionId: 'engine-session', status: 'running', startedAt: '2026-11-12T10:00:00.000Z' }] as never)
        vi.mocked(reconnectRun).mockResolvedValue(stream())
        const res = await RESUME(resume())
        expect(res.status).toBe(200)
        expect(reconnectRun).toHaveBeenCalledWith(conn, 'assistant', 'run-1')
    })

    it('replays nothing of a chat the caller may not read, or with nothing running', async () => {
        setup({ assistant_chats: [chat({ engine_session_id: 'engine-session' })] }, 'teammate')
        expect((await RESUME(resume())).status).toBe(204)
        expect(listRuns).not.toHaveBeenCalled()

        setup({ assistant_chats: [chat({ engine_session_id: 'engine-session' })] })
        vi.mocked(listRuns).mockResolvedValue([])
        expect((await RESUME(resume())).status).toBe(204)
        expect((await RESUME(new Request('https://lumvika.test/api/chat/assistant/resume'))).status).toBe(204)
    })
})
