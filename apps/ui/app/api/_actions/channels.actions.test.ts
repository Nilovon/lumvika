import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const mocks = vi.hoisted(() => ({ getSessionWorkspace: vi.fn() }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getSessionWorkspace: mocks.getSessionWorkspace, getServerSession: vi.fn() }))
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/work/channel-coworkers.service', async importOriginal => ({
    ...(await importOriginal<typeof import('@/app/api/_services/work/channel-coworkers.service')>()),
    reactToChannelMessage: vi.fn(),
    runAfterResponse: vi.fn(),
    summonCoworkers: vi.fn(),
    listChannelTurns: vi.fn(async () => []),
}))

const { reactToChannelMessage, runAfterResponse } = await import('@/app/api/_services/work/channel-coworkers.service')
const actions = await import('./channels.actions')

const WORKSPACE = 7

function signedIn(userId: string, role: 'admin' | 'member' = 'member', boxScope: 'all' | 'assigned' = 'all') {
    mocks.getSessionWorkspace.mockResolvedValue({ user: { id: userId, workspace_id: WORKSPACE }, workspaceRefused: false, membership: { role, box_scope: boxScope } })
}

function channel(id: string, kind = 'public', createdBy = 'anna'): Row {
    return { id, workspace_id: WORKSPACE, name: id, description: null, kind, project_id: null, team_id: null, created_by: createdBy, archived_at: null, created_at: 'then', updated_at: 'then' }
}

function member(channelId: string, ref: { userId?: string; agentId?: string }): Row {
    return { id: `m-${channelId}-${ref.userId ?? ref.agentId}`, channel_id: channelId, workspace_id: WORKSPACE, user_id: ref.userId ?? null, agent_id: ref.agentId ?? null, last_read_at: null, created_at: 'then', updated_at: 'then' }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        channels: [channel('pub'), channel('shut', 'private', 'ben')],
        channel_members: [member('shut', { userId: 'ben' }), member('shut', { userId: 'carl' })],
        channel_messages: [],
        workspace_members: ['anna', 'ben', 'carl'].map(user_id => ({ user_id, workspace_id: WORKSPACE })),
        spaces: [
            { id: 'open-box', workspace_id: WORKSPACE, visibility: 'workspace' },
            { id: 'closed-box', workspace_id: WORKSPACE, visibility: 'restricted' },
        ],
        space_members: [],
        agents: [
            { id: 'ada', workspace_id: WORKSPACE, space_id: 'open-box', engine_agent_id: 'eng-ada', name: 'Ada', handle: 'ada' },
            { id: 'vault', workspace_id: WORKSPACE, space_id: 'closed-box', engine_agent_id: 'eng-vault', name: 'Vault', handle: 'vault' },
        ],
        activity_events: [],
        ...tables,
    }
    workDatabase(rows)
    return { rows }
}

beforeEach(() => {
    vi.clearAllMocks()
    signedIn('anna')
    vi.mocked(reactToChannelMessage).mockResolvedValue({ agentIds: [], outsiders: [] })
})

describe('reading', () => {
    it('hides a private channel from a non-member', async () => {
        setup()
        await expect(actions.getChannelAction('shut')).resolves.toMatchObject({ ok: false, code: 'channelNotFound' })
        await expect(actions.listChannelMessagesAction('shut')).resolves.toMatchObject({ ok: false, code: 'channelNotFound' })
    })

    it('lets anyone scoped to all read a public channel before joining', async () => {
        setup()
        await expect(actions.getChannelAction('pub')).resolves.toMatchObject({ ok: true, channel: { id: 'pub', access: 'manage', isMember: false, members: [] } })
        await expect(actions.listChannelMessagesAction('pub')).resolves.toMatchObject({ ok: true, messages: [], turns: [] })
    })
})

describe('postChannelMessageAction', () => {
    it('posts, sets the coworkers off and names the ones outside the channel', async () => {
        setup()
        vi.mocked(reactToChannelMessage).mockResolvedValue({ agentIds: [], outsiders: ['ada'] })
        const result = await actions.postChannelMessageAction('pub', { body: 'hi @ada' })
        expect(result).toMatchObject({ ok: true, message: { body: 'hi @ada' }, outsiders: [{ id: 'ada', name: 'Ada' }], canAddOutsiders: true })
        expect(reactToChannelMessage).toHaveBeenCalledWith({ workspaceId: WORKSPACE }, expect.objectContaining({ userId: 'anna' }), expect.objectContaining({ body: 'hi @ada' }))
    })

    it('lets only a manager add an outsider to a private channel', async () => {
        setup()
        signedIn('carl')
        vi.mocked(reactToChannelMessage).mockResolvedValue({ agentIds: [], outsiders: ['ada'] })
        await expect(actions.postChannelMessageAction('shut', { body: 'hi' })).resolves.toMatchObject({ ok: true, canAddOutsiders: false })
    })

    it('mentions, summons and offers to add only a coworker the person can see', async () => {
        const { rows } = setup()
        signedIn('anna', 'member', 'assigned')
        rows.channel_members.push(member('pub', { userId: 'anna' }))
        vi.mocked(reactToChannelMessage).mockImplementation(async (_scope, _person, message) => ({ agentIds: [], outsiders: message.mentions.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : [])) }))

        const result = await actions.postChannelMessageAction('pub', { body: 'hi @vault', mentions: [{ kind: 'agent', agentId: 'vault' }] })

        expect(result).toMatchObject({ ok: true, message: { body: 'hi @vault', mentions: [] }, outsiders: [] })
        expect(rows.channel_messages[0]).toMatchObject({ mentions: [] })
    })

    it('refuses an empty message', async () => {
        setup()
        await expect(actions.postChannelMessageAction('pub', { body: '   ' })).resolves.toMatchObject({ ok: false, code: 'messageRequired' })
    })
})

describe('names a reader gets', () => {
    const message = (id: string, overrides: Row) => ({ id, channel_id: 'pub', workspace_id: WORKSPACE, author_user_id: 'ben', author_agent_id: null, body: 'x', parent_message_id: null, mentions: [], edited_at: null, deleted_at: null, created_at: id, updated_at: id, ...overrides })

    it('names a coworker that wrote in the channel to every reader, a coworker only mentioned to those who see it', async () => {
        setup({
            channel_messages: [
                message('m1', { body: 'ask @vault', mentions: [{ kind: 'agent', agentId: 'vault' }] }),
                message('m2', { author_user_id: null, author_agent_id: 'ada', body: 'done' }),
            ],
        })
        signedIn('anna', 'member', 'assigned')
        const scoped = await actions.listChannelMessagesAction('pub')
        expect(scoped).toMatchObject({ ok: false })
        signedIn('anna')
        const reader = await actions.listChannelMessagesAction('pub')
        expect(reader.ok && reader.coworkers.map(coworker => coworker.id)).toEqual(['ada'])
        signedIn('anna', 'admin')
        const admin = await actions.listChannelMessagesAction('pub')
        expect(admin.ok && admin.coworkers.map(coworker => coworker.id).sort()).toEqual(['ada', 'vault'])
        const thread = await actions.getChannelThreadAction('pub', 'm1')
        expect(thread.ok && thread.coworkers.map(coworker => coworker.id)).toEqual(['vault'])
        signedIn('anna')
        const hiddenThread = await actions.getChannelThreadAction('pub', 'm1')
        expect(hiddenThread.ok && hiddenThread.coworkers).toEqual([])
    })
})

describe('linking a channel to a project', () => {
    const projects = [
        { id: 'open-p', workspace_id: WORKSPACE, key: 'OPEN', name: 'Open', visibility: 'workspace' },
        { id: 'secret-p', workspace_id: WORKSPACE, key: 'SEC', name: 'Secret', visibility: 'restricted' },
    ]

    it('needs use of the project, and names it only to a reader who sees it', async () => {
        const { rows } = setup({ projects, project_members: [] })
        await expect(actions.createChannelAction({ name: 'deal', kind: 'public', projectId: 'secret-p' })).resolves.toMatchObject({ ok: false, code: 'projectNotFound' })
        await expect(actions.createChannelAction({ name: 'launch', kind: 'public', projectId: 'open-p' })).resolves.toMatchObject({ ok: true })
        signedIn('ben')
        await expect(actions.updateChannelAction('shut', { projectId: 'secret-p' })).resolves.toMatchObject({ ok: false, code: 'projectNotFound' })

        rows.channels.find(row => row.id === 'pub')!.project_id = 'secret-p'
        signedIn('anna')
        await expect(actions.getChannelAction('pub')).resolves.toMatchObject({ ok: true, channel: { project: null } })
        signedIn('anna', 'admin')
        await expect(actions.getChannelAction('pub')).resolves.toMatchObject({ ok: true, channel: { project: { key: 'SEC' } } })
    })
})

describe('deleteChannelMessageAction', () => {
    it('lets the author or a manager delete, nobody else', async () => {
        setup({ channel_messages: [{ id: 'm1', channel_id: 'shut', workspace_id: WORKSPACE, author_user_id: 'carl', author_agent_id: null, body: 'oops', parent_message_id: null, mentions: [], edited_at: null, deleted_at: null, created_at: 'a', updated_at: 'a' }] })
        signedIn('anna', 'member')
        await expect(actions.deleteChannelMessageAction('m1')).resolves.toMatchObject({ ok: false, code: 'channelNotFound' })
        signedIn('ben')
        await expect(actions.deleteChannelMessageAction('m1')).resolves.toMatchObject({ ok: true, message: { deletedAt: expect.any(String), body: '' } })
    })
})

describe('managing a channel', () => {
    it('keeps the settings and the archive for its manager', async () => {
        setup()
        signedIn('carl')
        await expect(actions.updateChannelAction('shut', { name: 'renamed' })).resolves.toMatchObject({ ok: false, code: 'channelManagerOnly' })
        await expect(actions.archiveChannelAction('shut')).resolves.toMatchObject({ ok: false, code: 'channelManagerOnly' })
        signedIn('ben')
        await expect(actions.updateChannelAction('shut', { name: 'renamed' })).resolves.toMatchObject({ ok: true, channel: { name: 'renamed' } })
    })

    it('adds to a public channel for anyone, to a private one for its manager', async () => {
        const { rows } = setup()
        await expect(actions.addChannelMembersAction('pub', [{ kind: 'agent', agentId: 'ada' }])).resolves.toEqual({ ok: true })
        signedIn('carl')
        await expect(actions.addChannelMembersAction('shut', [{ kind: 'user', userId: 'anna' }])).resolves.toMatchObject({ ok: false, code: 'channelManagerOnly' })
        expect(rows.channel_members.filter(row => row.channel_id === 'pub')).toEqual([expect.objectContaining({ agent_id: 'ada' })])
    })

    it('adds each member once, and refuses an empty or oversized list', async () => {
        const { rows } = setup()
        await expect(actions.addChannelMembersAction('pub', [{ kind: 'user', userId: 'ben' }, { kind: 'user', userId: 'ben' }, { kind: 'agent', agentId: 'ada' }])).resolves.toEqual({ ok: true })
        expect(rows.channel_members.filter(row => row.channel_id === 'pub')).toHaveLength(2)
        const crowd = Array.from({ length: 501 }, (_, index) => ({ kind: 'user' as const, userId: `user-${index}` }))
        await expect(actions.addChannelMembersAction('pub', crowd)).resolves.toMatchObject({ ok: false, code: 'invalidInput' })
        await expect(actions.addChannelMembersAction('pub', [])).resolves.toMatchObject({ ok: false, code: 'invalidInput' })
    })

    it('adds only a coworker the person reaches, and has it answer the message that asked for it', async () => {
        setup({ channel_messages: [{ id: 'm1', channel_id: 'pub', workspace_id: WORKSPACE, author_user_id: 'anna', author_agent_id: null, body: '@ada?', parent_message_id: null, mentions: [{ kind: 'agent', agentId: 'ada' }], edited_at: null, deleted_at: null, created_at: 'a', updated_at: 'a' }] })
        signedIn('anna', 'member', 'assigned')
        await expect(actions.addChannelMembersAction('pub', [{ kind: 'agent', agentId: 'vault' }])).resolves.toMatchObject({ ok: false, code: 'channelNotFound' })
        signedIn('anna')
        await expect(actions.addChannelMembersAction('pub', [{ kind: 'agent', agentId: 'vault' }])).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(actions.addChannelMembersAction('pub', [{ kind: 'agent', agentId: 'ada' }], 'm1')).resolves.toEqual({ ok: true })
        expect(runAfterResponse).toHaveBeenCalledTimes(1)
    })
})

describe('openDirectMessageAction', () => {
    it('opens a dm with a coworker the person reaches only', async () => {
        setup()
        await expect(actions.openDirectMessageAction({ kind: 'agent', agentId: 'vault' })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(actions.openDirectMessageAction({ kind: 'agent', agentId: 'ada' })).resolves.toMatchObject({ ok: true, channel: { kind: 'dm' } })
    })
})

describe('membership', () => {
    it('joins a public channel and marks it read', async () => {
        const { rows } = setup()
        await expect(actions.joinChannelAction('pub')).resolves.toEqual({ ok: true })
        await expect(actions.markChannelReadAction('pub')).resolves.toEqual({ ok: true })
        expect(rows.channel_members.find(row => row.channel_id === 'pub')).toMatchObject({ user_id: 'anna', last_read_at: expect.any(String) })
    })

    it('lists the channels with the person', async () => {
        setup()
        await expect(actions.listChannelsAction()).resolves.toMatchObject({ ok: true, userId: 'anna', channels: [{ id: 'pub' }] })
    })
})
