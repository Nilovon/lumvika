import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/lib/ai/generate-title', () => ({ generateSessionTitle: vi.fn() }))

const { archiveAssistantChat, createAssistantChat, deleteAssistantChat, fallbackTitle, getAssistantChat, getOwnAssistantChat, listAssistantChats, projectContextOf, recordAssistantTurn, titleAssistantChat, updateAssistantChat } = await import('./assistant-chats.service')

type Actor = import('@/app/api/_auth/access').Actor

const WORKSPACE = 7
const me: Actor = { kind: 'user', userId: 'me', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const teammate: Actor = { kind: 'user', userId: 'teammate', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const outsider: Actor = { kind: 'user', userId: 'outsider', workspaceId: WORKSPACE, role: 'member', boxScope: 'assigned' }

function chat(overrides: Row = {}): Row {
    return {
        id: 'chat-1',
        workspace_id: WORKSPACE,
        user_id: 'me',
        project_id: null,
        title: 'New chat',
        engine_session_id: null,
        model: null,
        shared: false,
        last_message_at: null,
        archived_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
        ...overrides,
    }
}

const openProject = { id: 'open', workspace_id: WORKSPACE, key: 'OPS', name: 'Operations', visibility: 'workspace', instructions: 'Answer in bullet points.', archived_at: null }
const secretProject = { id: 'secret', workspace_id: WORKSPACE, key: 'SEC', name: 'Secret', visibility: 'restricted', instructions: 'Never share this.', archived_at: null }

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = { assistant_chats: [], projects: [openProject, secretProject], project_members: [], ...tables }
    const db = workDatabase(rows)
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('getAssistantChat', () => {
    it('gives the owner their chat, private or not', async () => {
        const { scope } = setup({ assistant_chats: [chat()] })
        await expect(getAssistantChat(scope, me, 'chat-1')).resolves.toMatchObject({ access: 'owner' })
    })

    it('hides a private chat from everyone else, as if it did not exist', async () => {
        const { scope } = setup({ assistant_chats: [chat()] })
        await expect(getAssistantChat(scope, teammate, 'chat-1')).rejects.toMatchObject({ code: 'assistantChatNotFound' })
    })

    it('lets a member read a shared chat, and nothing more', async () => {
        const { scope } = setup({ assistant_chats: [chat({ shared: true })] })
        await expect(getAssistantChat(scope, teammate, 'chat-1')).resolves.toMatchObject({ access: 'reader' })
        await expect(getOwnAssistantChat(scope, teammate, 'chat-1')).rejects.toMatchObject({ code: 'assistantChatReadOnly' })
        await expect(updateAssistantChat(scope, teammate, 'chat-1', { title: 'Mine now' })).rejects.toMatchObject({ code: 'assistantChatReadOnly' })
        const erase = vi.fn()
        await expect(deleteAssistantChat(scope, teammate, 'chat-1', erase)).rejects.toMatchObject({ code: 'assistantChatReadOnly' })
        expect(erase).not.toHaveBeenCalled()
    })

    it('hides a shared chat about a project the member does not see, and an archived one', async () => {
        const { scope } = setup({ assistant_chats: [chat({ shared: true, project_id: 'secret' }), chat({ id: 'chat-2', shared: true, archived_at: '2026-11-02T00:00:00.000Z' })] })
        await expect(getAssistantChat(scope, teammate, 'chat-1')).rejects.toMatchObject({ code: 'assistantChatNotFound' })
        await expect(getAssistantChat(scope, teammate, 'chat-2')).rejects.toMatchObject({ code: 'assistantChatNotFound' })
    })

    it('knows no chat of another workspace, nor any for the workspace itself', async () => {
        const { scope } = setup({ assistant_chats: [chat({ workspace_id: 99 })] })
        await expect(getAssistantChat(scope, me, 'chat-1')).rejects.toMatchObject({ code: 'assistantChatNotFound' })
        await expect(getAssistantChat(scope, { kind: 'workspace', workspaceId: WORKSPACE }, 'chat-1')).rejects.toMatchObject({ code: 'assistantChatNotFound' })
    })
})

describe('createAssistantChat', () => {
    it('opens a chat for its caller, about a project they see', async () => {
        const { scope, db } = setup()
        const row = await createAssistantChat(scope, me, { projectId: 'open', model: 'lumvika-max' })
        expect(row).toMatchObject({ user_id: 'me', workspace_id: WORKSPACE, project_id: 'open', title: 'New chat', model: 'lumvika-max' })
        expect(db.writes('assistant_chats')).toHaveLength(1)
    })

    it('refuses a project the caller does not see', async () => {
        const { scope, db } = setup()
        await expect(createAssistantChat(scope, me, { projectId: 'secret' })).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(createAssistantChat(scope, me, { projectId: 'missing' })).rejects.toMatchObject({ code: 'projectNotFound' })
        expect(db.writes('assistant_chats')).toHaveLength(0)
    })
})

describe('listAssistantChats', () => {
    it("lists the caller's chats, the archived ones apart, and the ones shared with them", async () => {
        const { scope } = setup({
            assistant_chats: [
                chat({ id: 'old', last_message_at: '2026-11-02T00:00:00.000Z' }),
                chat({ id: 'recent', last_message_at: '2026-11-10T00:00:00.000Z' }),
                chat({ id: 'gone', archived_at: '2026-11-03T00:00:00.000Z' }),
                chat({ id: 'theirs-private', user_id: 'teammate' }),
                chat({ id: 'theirs-shared', user_id: 'teammate', shared: true }),
                chat({ id: 'theirs-secret', user_id: 'teammate', shared: true, project_id: 'secret' }),
                chat({ id: 'theirs-archived', user_id: 'teammate', shared: true, archived_at: '2026-11-03T00:00:00.000Z' }),
                chat({ id: 'elsewhere', workspace_id: 99, shared: true, user_id: 'teammate' }),
            ],
        })
        const list = await listAssistantChats(scope, me)
        expect(list.mine.map(c => c.id)).toEqual(['recent', 'old'])
        expect(list.archived.map(c => c.id)).toEqual(['gone'])
        expect(list.shared.map(c => c.id)).toEqual(['theirs-shared'])
    })

    it('shows an admin the shared chats of every project', async () => {
        const { scope } = setup({ assistant_chats: [chat({ id: 'theirs-secret', user_id: 'teammate', shared: true, project_id: 'secret' })] })
        const list = await listAssistantChats(scope, { ...me, role: 'admin' })
        expect(list.shared.map(c => c.id)).toEqual(['theirs-secret'])
    })
})

describe('updating a chat', () => {
    it('renames, shares and moves it to a visible project, for its owner', async () => {
        const { scope } = setup({ assistant_chats: [chat()] })
        const row = await updateAssistantChat(scope, me, 'chat-1', { title: 'Pricing', shared: true, projectId: 'open', model: 'gpt-5.4' })
        expect(row).toMatchObject({ title: 'Pricing', shared: true, project_id: 'open', model: 'gpt-5.4' })
        await expect(updateAssistantChat(scope, me, 'chat-1', { projectId: 'secret' })).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(updateAssistantChat(scope, me, 'chat-1', { title: '  ' })).rejects.toMatchObject({ code: 'titleRequired' })
        expect(await updateAssistantChat(scope, me, 'chat-1', {})).toMatchObject({ title: 'Pricing' })
    })

    it('archives, restores and deletes it', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat()] })
        expect((await archiveAssistantChat(scope, me, 'chat-1', true)).archived_at).not.toBeNull()
        expect((await archiveAssistantChat(scope, me, 'chat-1', false)).archived_at).toBeNull()
        expect(await deleteAssistantChat(scope, me, 'chat-1', vi.fn())).toBe('none')
        expect(rows.assistant_chats).toHaveLength(0)
    })

    it('erases the conversation on the engine before the row', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat({ engine_session_id: 'engine-1' })] })
        const erase = vi.fn(async () => {
            expect(rows.assistant_chats).toHaveLength(1)
            return 'erased' as const
        })
        expect(await deleteAssistantChat(scope, me, 'chat-1', erase)).toBe('erased')
        expect(erase).toHaveBeenCalledWith('engine-1')
        expect(rows.assistant_chats).toHaveLength(0)
    })

    it.each(['outdated', 'unreachable'] as const)('still deletes the row when the server keeps the conversation (%s), and says so', async outcome => {
        const { scope, rows } = setup({ assistant_chats: [chat({ engine_session_id: 'engine-1' })] })
        expect(await deleteAssistantChat(scope, me, 'chat-1', async () => outcome)).toBe(outcome)
        expect(rows.assistant_chats).toHaveLength(0)
    })
})

describe('recordAssistantTurn', () => {
    it('keeps the engine session, the model and when the chat last moved', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat()] })
        await recordAssistantTurn(scope, rows.assistant_chats[0] as never, { engineSessionId: 'engine-1', model: 'lumvika-max' })
        expect(rows.assistant_chats[0]).toMatchObject({ engine_session_id: 'engine-1', model: 'lumvika-max' })
        expect(rows.assistant_chats[0].last_message_at).toEqual(expect.any(String))
    })

    it('leaves the session and model alone when they did not change', async () => {
        const { scope, db, rows } = setup({ assistant_chats: [chat({ engine_session_id: 'engine-1', model: 'm' })] })
        await recordAssistantTurn(scope, rows.assistant_chats[0] as never, { engineSessionId: 'engine-1', model: 'm' })
        expect(db.writes('assistant_chats')[0]).not.toHaveProperty('engine_session_id')
    })
})

describe('titling a chat', () => {
    it('names it with the title model', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat()] })
        expect(await titleAssistantChat(scope, rows.assistant_chats[0] as never, 'How do I price a SaaS?', async () => 'SaaS pricing')).toBe('SaaS pricing')
        expect(rows.assistant_chats[0].title).toBe('SaaS pricing')
    })

    it('falls back to the start of the message when no title model answers', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat()] })
        const long = 'Help me write a short and friendly reminder for the customers who have not paid their last invoice'
        const title = await titleAssistantChat(scope, rows.assistant_chats[0] as never, long, () => Promise.reject(new Error('no key')))
        expect(title).toBe('Help me write a short and friendly reminder for the…')
    })

    it('keeps a title the owner already gave it, and ignores an empty message', async () => {
        const { scope, rows } = setup({ assistant_chats: [chat({ title: 'Mine' }), chat({ id: 'chat-2' })] })
        expect(await titleAssistantChat(scope, rows.assistant_chats[0] as never, 'Hello', async () => 'Greeting')).toBeNull()
        expect(await titleAssistantChat(scope, rows.assistant_chats[1] as never, '   ', async () => 'Greeting')).toBeNull()
    })

    it('cuts a word-less message where it must', () => {
        expect(fallbackTitle('x'.repeat(80))).toBe(`${'x'.repeat(60)}…`)
        expect(fallbackTitle('  short  ')).toBe('short')
    })
})

describe('projectContextOf', () => {
    it("hands over the instructions of the chat's project, only to someone who sees it", async () => {
        const { scope } = setup()
        expect(await projectContextOf(scope, me, chat({ project_id: 'open' }) as never)).toEqual({ name: 'Operations', instructions: 'Answer in bullet points.' })
        expect(await projectContextOf(scope, me, chat({ project_id: 'secret' }) as never)).toBeNull()
        expect(await projectContextOf(scope, outsider, chat({ project_id: 'open' }) as never)).toBeNull()
        expect(await projectContextOf(scope, { ...me, role: 'admin' }, chat({ project_id: 'secret' }) as never)).toEqual({ name: 'Secret', instructions: 'Never share this.' })
    })

    it('hands over nothing without a project, or with empty instructions', async () => {
        const { scope } = setup({ projects: [{ ...openProject, instructions: '  ' }] })
        expect(await projectContextOf(scope, me, chat() as never)).toBeNull()
        expect(await projectContextOf(scope, me, chat({ project_id: 'open' }) as never)).toBeNull()
    })
})
