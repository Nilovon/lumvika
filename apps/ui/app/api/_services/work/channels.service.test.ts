import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const {
    addChannelMembers,
    archiveChannel,
    createChannel,
    deleteChannelMessage,
    editChannelMessage,
    joinChannel,
    listChannelMessages,
    listChannelsFor,
    listThread,
    markChannelRead,
    openDirectMessage,
    postChannelMessage,
    resolveMentions,
} = await import('./channels.service')

type ChannelPerson = import('./channels.service').ChannelPerson

const WORKSPACE = 7
const anna: ChannelPerson = { kind: 'user', userId: 'anna', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const ben: ChannelPerson = { kind: 'user', userId: 'ben', workspaceId: WORKSPACE, role: 'member', boxScope: 'assigned' }
const ANNA = { kind: 'user', userId: 'anna' } as const
const BEN = { kind: 'user', userId: 'ben' } as const
const ADA = { kind: 'agent', agentId: 'ada' } as const

function channel(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, name: id, description: null, kind: 'public', project_id: null, team_id: null, created_by: 'anna', archived_at: null, created_at: `2026-11-01T00:00:0${id.length % 10}.000Z`, updated_at: 'then', ...overrides }
}

function member(channelId: string, ref: { userId?: string; agentId?: string }, lastReadAt: string | null = null): Row {
    return { id: `m-${channelId}-${ref.userId ?? ref.agentId}`, channel_id: channelId, workspace_id: WORKSPACE, user_id: ref.userId ?? null, agent_id: ref.agentId ?? null, last_read_at: lastReadAt, created_at: 'then', updated_at: 'then' }
}

function message(id: string, channelId: string, createdAt: string, overrides: Row = {}): Row {
    return { id, channel_id: channelId, workspace_id: WORKSPACE, author_user_id: 'ben', author_agent_id: null, body: `body ${id}`, parent_message_id: null, mentions: [], edited_at: null, deleted_at: null, created_at: createdAt, updated_at: createdAt, ...overrides }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        channels: [],
        channel_members: [],
        channel_messages: [],
        activity_events: [],
        workspace_members: [
            { user_id: 'anna', workspace_id: WORKSPACE },
            { user_id: 'ben', workspace_id: WORKSPACE },
        ],
        agents: [{ id: 'ada', workspace_id: WORKSPACE, handle: 'ada', name: 'Ada' }],
        projects: [],
        teams: [],
        ...tables,
    }
    const db = workDatabase(rows, {
        rpc: {
            channel_summaries: args =>
                rows.channels
                    .filter(row => row.workspace_id === args.p_workspace_id && !row.archived_at)
                    .map(row => {
                        const mine = rows.channel_members.find(m => m.channel_id === row.id && m.user_id === args.p_user_id)
                        const messages = rows.channel_messages.filter(m => m.channel_id === row.id && !m.deleted_at)
                        const unread = mine ? messages.filter(m => m.author_user_id !== args.p_user_id && (!mine.last_read_at || String(m.created_at) > String(mine.last_read_at))).length : 0
                        const last = messages.filter(m => !m.parent_message_id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
                        return { channel_id: row.id, unread_count: unread, last_message_id: last?.id ?? null }
                    }),
        },
    })
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('createChannel and archiveChannel', () => {
    it('makes its creator the first member and logs it', async () => {
        const { rows, scope } = setup()
        const created = await createChannel(scope, anna, { name: '#launch', kind: 'private', members: [BEN, ADA] })
        expect(created).toMatchObject({ name: 'launch', kind: 'private', createdBy: 'anna' })
        expect(rows.channel_members.map(row => [row.user_id ?? row.agent_id, row.last_read_at ? 'read' : 'unread'])).toEqual([
            ['anna', 'read'],
            ['ben', 'unread'],
            ['ada', 'unread'],
        ])
        expect(rows.activity_events).toEqual([expect.objectContaining({ action: 'channel.created', entity_id: created.id })])
    })

    it('refuses a direct message, an empty name and a stranger', async () => {
        const { scope } = setup()
        await expect(createChannel(scope, anna, { name: 'x', kind: 'dm' })).rejects.toMatchObject({ code: 'channelKindInvalid' })
        await expect(createChannel(scope, anna, { name: ' # ', kind: 'public' })).rejects.toMatchObject({ code: 'nameRequired' })
        await expect(createChannel(scope, anna, { name: 'ops', kind: 'public', members: [{ kind: 'user', userId: 'stranger' }] })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
    })

    it('reads a taken name as such', async () => {
        const { scope } = setup({})
        const db = workDatabase({ channels: [], workspace_members: [] }, { refuse: { channels: { code: '23505', message: 'duplicate' } } })
        await expect(createChannel({ ...scope, db: db.scope }, anna, { name: 'general', kind: 'public' })).rejects.toMatchObject({ code: 'channelNameTaken', params: { name: 'general' } })
    })

    it('archives a channel, never a direct message', async () => {
        const { rows, scope } = setup({ channels: [channel('ops'), channel('dm-1', { kind: 'dm', name: '' })] })
        await archiveChannel(scope, ANNA, 'ops')
        expect(rows.channels[0].archived_at).toEqual(expect.any(String))
        expect(rows.activity_events[0]).toMatchObject({ action: 'channel.archived' })
        await expect(archiveChannel(scope, ANNA, 'dm-1')).rejects.toMatchObject({ code: 'channelDirectMessageFixed' })
    })
})

describe('listChannelsFor', () => {
    it('creates #general once for a workspace without channels, and seats newcomers in it', async () => {
        const { rows, scope } = setup()
        const first = await listChannelsFor(scope, anna)
        const forBen = await listChannelsFor(scope, ben)
        expect(rows.channels).toHaveLength(1)
        expect(first).toEqual([expect.objectContaining({ name: 'general', kind: 'public', isMember: true, access: 'use' })])
        expect(forBen).toEqual([expect.objectContaining({ name: 'general', isMember: true })])
    })

    it('leaves someone already in a channel where they are', async () => {
        const { rows, scope } = setup({ channels: [channel('general'), channel('ops')], channel_members: [member('ops', { userId: 'anna' })] })
        await listChannelsFor(scope, anna)
        expect(rows.channel_members.map(row => row.channel_id)).toEqual(['ops'])
    })

    it('shows public channels to a member scoped to all, private ones and dms only to their members', async () => {
        const { scope } = setup({
            channels: [channel('pub'), channel('secret', { kind: 'private', created_by: 'ben' }), channel('mine', { kind: 'private', created_by: 'ben' }), channel('old', { archived_at: 'then' }), channel('dm-1', { kind: 'dm', name: '' })],
            channel_members: [member('mine', { userId: 'anna' }), member('dm-1', { userId: 'anna' }), member('dm-1', { agentId: 'ada' })],
        })
        const forAnna = await listChannelsFor(scope, anna)
        expect(forAnna.map(item => [item.id, item.access, item.isMember])).toEqual([
            ['pub', 'manage', false],
            ['mine', 'use', true],
            ['dm-1', 'use', true],
        ])
        expect(forAnna.find(item => item.id === 'dm-1')?.dmMembers).toEqual([ANNA, ADA])

        const forBen = await listChannelsFor(scope, ben)
        expect(forBen.map(item => item.id)).toEqual([])
    })

    it('counts what others wrote since the person last read, threads included', async () => {
        const { scope } = setup({
            channels: [channel('pub')],
            channel_members: [member('pub', { userId: 'anna' }, '2026-11-02T00:00:00.000Z')],
            channel_messages: [
                message('old', 'pub', '2026-11-01T00:00:00.000Z'),
                message('new', 'pub', '2026-11-03T00:00:00.000Z'),
                message('reply', 'pub', '2026-11-04T00:00:00.000Z', { parent_message_id: 'new' }),
                message('own', 'pub', '2026-11-05T00:00:00.000Z', { author_user_id: 'anna' }),
                message('gone', 'pub', '2026-11-06T00:00:00.000Z', { deleted_at: 'then' }),
            ],
        })
        const [pub] = await listChannelsFor(scope, anna)
        expect(pub.unreadCount).toBe(2)
        expect(pub.lastMessage).toMatchObject({ id: 'own', author: ANNA })
    })
})

describe('membership', () => {
    it('joins a public channel only', async () => {
        const { rows, scope } = setup({ channels: [channel('pub'), channel('shut', { kind: 'private' })] })
        await joinChannel(scope, ben, 'pub')
        expect(rows.channel_members).toEqual([expect.objectContaining({ channel_id: 'pub', user_id: 'ben', last_read_at: expect.any(String) })])
        await expect(joinChannel(scope, ben, 'shut')).rejects.toMatchObject({ code: 'channelNotPublic' })
    })

    it('adds coworkers of the workspace only', async () => {
        const { rows, scope } = setup({ channels: [channel('pub')] })
        await expect(addChannelMembers(scope, 'pub', [{ kind: 'agent', agentId: 'elsewhere' }])).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
        await addChannelMembers(scope, 'pub', [ADA])
        expect(rows.channel_members).toEqual([expect.objectContaining({ agent_id: 'ada', user_id: null })])
    })
})

describe('openDirectMessage', () => {
    it('opens the dm once and finds it again', async () => {
        const { rows, scope } = setup()
        const first = await openDirectMessage(scope, anna, ADA)
        const again = await openDirectMessage(scope, anna, ADA)
        expect(again.id).toBe(first.id)
        expect(rows.channels).toEqual([expect.objectContaining({ kind: 'dm', name: '' })])
        expect(rows.channel_members.map(row => row.user_id ?? row.agent_id)).toEqual(['anna', 'ada'])
    })

    it('tells a dm apart from a group the two share', async () => {
        const { rows, scope } = setup({
            channels: [channel('group', { kind: 'dm', name: '' })],
            channel_members: [member('group', { userId: 'anna' }), member('group', { userId: 'ben' }), member('group', { agentId: 'ada' })],
        })
        const dm = await openDirectMessage(scope, anna, BEN)
        expect(dm.id).not.toBe('group')
        expect(rows.channels).toHaveLength(2)
    })

    it('refuses the person themselves and a stranger', async () => {
        const { scope } = setup()
        await expect(openDirectMessage(scope, anna, ANNA)).rejects.toMatchObject({ code: 'directMessageWithSelf' })
        await expect(openDirectMessage(scope, anna, { kind: 'user', userId: 'stranger' })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
    })
})

describe('mentions', () => {
    it('keeps the picked members of the workspace and adds coworker handles written in the text', async () => {
        const { scope } = setup()
        await expect(resolveMentions(scope, 'hey @ADA and @nobody, mail@ada.io', [BEN])).resolves.toEqual([BEN, ADA])
    })

    it('refuses a mention outside the workspace', async () => {
        const { scope } = setup()
        await expect(resolveMentions(scope, 'hi', [{ kind: 'user', userId: 'stranger' }])).rejects.toMatchObject({ code: 'mentionNotInWorkspace' })
    })

    it('leaves a coworker the author cannot see as plain text, picked or written, like one that does not exist', async () => {
        const { scope } = setup()
        await expect(resolveMentions(scope, 'hi', [{ kind: 'agent', agentId: 'ghost' }])).resolves.toEqual([])
        await expect(resolveMentions(scope, 'hey @ada', [ADA, BEN], new Set())).resolves.toEqual([BEN])
        await expect(resolveMentions(scope, 'hey @ada', [], new Set(['ada']))).resolves.toEqual([ADA])
    })
})

describe('messages', () => {
    it('posts, joins a public channel on the first message and reads it for its author', async () => {
        const { rows, scope } = setup({ channels: [channel('pub')] })
        const posted = await postChannelMessage(scope, ANNA, 'pub', { body: ' Hello @ada ', mentions: [] })
        expect(posted).toMatchObject({ body: 'Hello @ada', mentions: [ADA], parentMessageId: null })
        expect(rows.channel_members).toEqual([expect.objectContaining({ user_id: 'anna', last_read_at: posted.createdAt })])
    })

    it('files a reply to a reply under its thread', async () => {
        const { scope } = setup({ channels: [channel('pub')], channel_messages: [message('root', 'pub', 'a'), message('r1', 'pub', 'b', { parent_message_id: 'root' })] })
        const reply = await postChannelMessage(scope, ANNA, 'pub', { body: 'me too', parentMessageId: 'r1' })
        expect(reply.parentMessageId).toBe('root')
        await expect(postChannelMessage(scope, ANNA, 'pub', { body: 'x', parentMessageId: 'missing' })).rejects.toMatchObject({ code: 'channelMessageNotFound' })
    })

    it('refuses an archived channel', async () => {
        const { scope } = setup({ channels: [channel('pub', { archived_at: 'then' })] })
        await expect(postChannelMessage(scope, ANNA, 'pub', { body: 'x' })).rejects.toMatchObject({ code: 'channelArchived' })
    })

    it('lets only the author edit', async () => {
        const { scope } = setup({ channels: [channel('pub')], channel_messages: [message('m1', 'pub', 'a')] })
        await expect(editChannelMessage(scope, ANNA, 'm1', { body: 'mine now' })).rejects.toMatchObject({ code: 'channelMessageAuthorOnly' })
        await expect(editChannelMessage(scope, BEN, 'm1', { body: 'fixed' })).resolves.toMatchObject({ body: 'fixed', editedAt: expect.any(String) })
    })

    it('soft deletes for its author or a manager, wiping the words', async () => {
        const { rows, scope } = setup({ channels: [channel('pub')], channel_messages: [message('m1', 'pub', 'a', { mentions: [ADA] }), message('m2', 'pub', 'b')] })
        await expect(deleteChannelMessage(scope, ANNA, 'm1', false)).rejects.toMatchObject({ code: 'channelMessageAuthorOnly' })
        await expect(deleteChannelMessage(scope, BEN, 'm1', false)).resolves.toMatchObject({ body: '', mentions: [], deletedAt: expect.any(String) })
        await deleteChannelMessage(scope, ANNA, 'm2', true)
        expect(rows.channel_messages.map(row => [row.id, row.body, row.deleted_at ? 'deleted' : 'kept'])).toEqual([
            ['m1', '', 'deleted'],
            ['m2', '', 'deleted'],
        ])
    })

    it('pages top-level messages newest window first, with their thread summary', async () => {
        const { scope } = setup({
            channels: [channel('pub')],
            channel_messages: [
                message('m1', 'pub', '2026-11-01T00:00:01.000Z'),
                message('m2', 'pub', '2026-11-01T00:00:02.000Z'),
                message('m3', 'pub', '2026-11-01T00:00:03.000Z'),
                message('r1', 'pub', '2026-11-01T00:00:04.000Z', { parent_message_id: 'm3', author_user_id: null, author_agent_id: 'ada' }),
                message('r2', 'pub', '2026-11-01T00:00:05.000Z', { parent_message_id: 'm3' }),
            ],
        })
        const page = await listChannelMessages(scope, 'pub', { limit: 2 })
        expect(page.messages.map(m => m.id)).toEqual(['m2', 'm3'])
        expect(page.messages[1].thread).toEqual({ replyCount: 2, lastReplyAt: '2026-11-01T00:00:05.000Z', replyAuthors: [ADA, BEN] })
        expect(page.nextCursor).toBe('2026-11-01T00:00:02.000Z')

        const older = await listChannelMessages(scope, 'pub', { limit: 2, before: page.nextCursor })
        expect(older).toMatchObject({ messages: [{ id: 'm1' }], nextCursor: null })

        await expect(listThread(scope, 'pub', 'm3')).resolves.toMatchObject({ root: { id: 'm3' }, replies: [{ id: 'r1' }, { id: 'r2' }] })
        await expect(listThread(scope, 'pub', 'r1')).rejects.toMatchObject({ code: 'channelMessageNotFound' })
    })

    it('marks a channel read for the person', async () => {
        const { rows, scope } = setup({ channels: [channel('pub')], channel_members: [member('pub', { userId: 'anna' })] })
        await markChannelRead(scope, anna, 'pub')
        expect(rows.channel_members[0].last_read_at).toEqual(expect.any(String))
    })
})
