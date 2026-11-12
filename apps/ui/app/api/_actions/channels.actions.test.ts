import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const mocks = vi.hoisted(() => ({ getSessionWorkspace: vi.fn() }))

vi.mock('@/supabase/session/getServerSession', () => ({ getSessionWorkspace: mocks.getSessionWorkspace, getServerSession: vi.fn() }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_services/work/channel-coworkers.service', async importOriginal => ({
    ...(await importOriginal<typeof import('@/app/api/_services/work/channel-coworkers.service')>()),
    reactToChannelMessage: vi.fn(),
    runAfterResponse: vi.fn(),
    summonCoworkers: vi.fn(),
    listChannelTurns: vi.fn(async () => []),
}))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
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
    const db = workDatabase(rows)
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
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

    it('refuses an empty message', async () => {
        setup()
        await expect(actions.postChannelMessageAction('pub', { body: '   ' })).resolves.toMatchObject({ ok: false, code: 'messageRequired' })
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
