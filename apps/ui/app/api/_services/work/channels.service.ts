import 'server-only'

import {
    createChannelInputSchema,
    postChannelMessageInputSchema,
    updateChannelInputSchema,
    type Channel,
    type ChannelMessage,
    type CreateChannelInput,
    type PostChannelMessageInput,
    type UpdateChannelInput,
    type WorkAuthor,
    type WorkMemberRef,
} from '@lumvika/contracts'

import { CHANNEL_NOT_FOUND, channelAccessOf, projectAccessFor, type ChannelAccess } from '@/app/api/_auth/project-access'
import type { Actor } from '@/app/api/_auth/access'
import type { Database } from '@/app/api/database.types'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { CHANNEL_COLUMNS, CHANNEL_MEMBER_COLUMNS, CHANNEL_MESSAGE_COLUMNS, type ChannelMemberRow, type ChannelMessageRow, type ChannelRow } from '@/app/api/_services/work/columns'
import { toChannel, toChannelMessage } from '@/app/api/_services/work/mappers'
import { assertMemberInWorkspace, authorColumns, clientOf, memberRefOf, parseWorkInput, sameMember, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { selectAll, selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

type ChannelUpdate = Database['public']['Tables']['channels']['Update']
type ChannelMemberInsert = Database['public']['Tables']['channel_members']['Insert']
type ChannelMessageUpdate = Database['public']['Tables']['channel_messages']['Update']

export type ChannelPerson = Extract<Actor, { kind: 'user' }>

export type ChannelListItem = Channel & {
    access: Exclude<ChannelAccess, 'none'>
    isMember: boolean
    unreadCount: number
    lastMessage: ChannelMessage | null
    // Who is in a direct message: the list names it after the other one.
    dmMembers: WorkMemberRef[]
}

export type ChannelThreadSummary = { replyCount: number; lastReplyAt: string; replyAuthors: WorkAuthor[] }
export type ChannelMessageView = ChannelMessage & { thread: ChannelThreadSummary | null }
export type ChannelMessagePage = { messages: ChannelMessageView[]; nextCursor: string | null }
export type ChannelMemberView = { id: string; member: WorkMemberRef; joinedAt: string }

export const GENERAL_CHANNEL_NAME = 'general'
export const DEFAULT_MESSAGE_PAGE = 50
const MAX_MESSAGE_PAGE = 100
const MAX_THREAD_AUTHORS = 3
const UNIQUE_VIOLATION = '23505'
const CHANNEL_RETURNING = CHANNEL_COLUMNS.join(',')
const MESSAGE_RETURNING = CHANNEL_MESSAGE_COLUMNS.join(',')
// `@handle` as the composer writes it: a word start, then the handle of a coworker.
const HANDLE_MENTION = /(?<=^|\s)@([\w-]{1,64})/g

async function readChannel(scope: WorkScope, channelId: string): Promise<ChannelRow> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'channels', CHANNEL_COLUMNS, { id: channelId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError(CHANNEL_NOT_FOUND)
    return data
}

async function readOpenChannel(scope: WorkScope, channelId: string): Promise<ChannelRow> {
    const channel = await readChannel(scope, channelId)
    if (channel.archived_at) throw new AppError('channelArchived')
    return channel
}

export async function getChannel(scope: WorkScope, channelId: string): Promise<Channel> {
    return toChannel(await readChannel(scope, channelId))
}

function memberColumns(ref: WorkMemberRef): Pick<ChannelMemberInsert, 'user_id' | 'agent_id'> {
    const columns = authorColumns(ref)
    return { user_id: columns.userId, agent_id: columns.agentId }
}

// Adding someone already there is a no-op: the partial unique indexes refuse the second row, and
// PostgREST cannot upsert on a partial index.
async function insertMember(scope: WorkScope, channelId: string, ref: WorkMemberRef, lastReadAt: string | null): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_members')
        .insert<ChannelMemberInsert>({ channel_id: channelId, workspace_id: scope.workspaceId, ...memberColumns(ref), last_read_at: lastReadAt })
    if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`Failed to add the channel member: ${error.message}`)
}

async function readMembers(scope: WorkScope, channelIds: string[]): Promise<ChannelMemberRow[]> {
    if (channelIds.length === 0) return []
    const { data, error } = await selectAll(clientOf(scope), 'channel_members', CHANNEL_MEMBER_COLUMNS, { workspace_id: scope.workspaceId, channel_id: channelIds }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to read the channel members: ${error.message}`)
    return data ?? []
}

export async function isChannelMember(scope: WorkScope, channelId: string, ref: WorkMemberRef): Promise<boolean> {
    const filters = ref.kind === 'user' ? { channel_id: channelId, user_id: ref.userId } : { channel_id: channelId, agent_id: ref.agentId }
    const { data } = await selectMaybeSingle(clientOf(scope), 'channel_members', ['id'] as const, filters)
    return !!data
}

async function assertLinks(scope: WorkScope, links: { projectId?: string | null; teamId?: string | null }): Promise<void> {
    const supabase = clientOf(scope)
    if (links.projectId) {
        const { data } = await selectMaybeSingle(supabase, 'projects', ['id'] as const, { id: links.projectId, workspace_id: scope.workspaceId })
        if (!data) throw new AppError('projectNotFound')
    }
    if (links.teamId) {
        const { data } = await selectMaybeSingle(supabase, 'teams', ['id'] as const, { id: links.teamId, workspace_id: scope.workspaceId })
        if (!data) throw new AppError('teamNotFound')
    }
}

function channelNameOf(raw: string): string {
    const name = raw.trim().replace(/^#+/, '').trim()
    if (!name) throw new AppError('nameRequired')
    return name
}

async function insertChannel(scope: WorkScope, fields: { name: string; description: string | null; kind: Channel['kind']; projectId: string | null; teamId: string | null; createdBy: string | null }): Promise<ChannelRow> {
    const { data, error } = await clientOf(scope)
        .from('channels')
        .insert<Database['public']['Tables']['channels']['Insert']>({
            workspace_id: scope.workspaceId,
            name: fields.name,
            description: fields.description,
            kind: fields.kind,
            project_id: fields.projectId,
            team_id: fields.teamId,
            created_by: fields.createdBy,
        })
        .select(CHANNEL_RETURNING)
        .single<ChannelRow>()
    if (error?.code === UNIQUE_VIOLATION) throw new AppError('channelNameTaken', { name: fields.name })
    if (error || !data) throw new Error(`Failed to create the channel: ${error?.message}`)
    return data
}

// The person who creates a channel is its first member, so a private one is never born unreachable.
export async function createChannel(scope: WorkScope, creator: ChannelPerson, input: CreateChannelInput): Promise<Channel> {
    const fields = parseWorkInput(createChannelInputSchema, input)
    if (fields.kind === 'dm') throw new AppError('channelKindInvalid')
    const name = channelNameOf(fields.name)
    await assertLinks(scope, fields)
    const extraMembers = (fields.members ?? []).filter(ref => !sameMember(ref, { kind: 'user', userId: creator.userId }))
    for (const ref of extraMembers) await assertMemberInWorkspace(scope, ref)

    const row = await insertChannel(scope, { name, description: fields.description ?? null, kind: fields.kind, projectId: fields.projectId ?? null, teamId: fields.teamId ?? null, createdBy: creator.userId })
    const now = new Date().toISOString()
    await insertMember(scope, row.id, { kind: 'user', userId: creator.userId }, now)
    for (const ref of extraMembers) await insertMember(scope, row.id, ref, null)

    await recordActivity(scope, { action: 'channel.created', entityType: 'channel', entityId: row.id, projectId: row.project_id, author: { kind: 'user', userId: creator.userId }, metadata: { name: row.name, kind: row.kind } })
    return toChannel(row)
}

export async function updateChannel(scope: WorkScope, channelId: string, input: UpdateChannelInput): Promise<Channel> {
    const fields = parseWorkInput(updateChannelInputSchema, input)
    const channel = await readOpenChannel(scope, channelId)
    if (channel.kind === 'dm') throw new AppError('channelDirectMessageFixed')
    await assertLinks(scope, fields)
    const name = fields.name !== undefined ? channelNameOf(fields.name) : undefined

    const patch: ChannelUpdate = {
        ...(name !== undefined ? { name } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        ...(fields.projectId !== undefined ? { project_id: fields.projectId } : {}),
        ...(fields.teamId !== undefined ? { team_id: fields.teamId } : {}),
    }
    if (Object.keys(patch).length === 0) return toChannel(channel)

    const { data, error } = await clientOf(scope).from('channels').update<ChannelUpdate>(patch).eq('id', channelId).eq('workspace_id', scope.workspaceId).select(CHANNEL_RETURNING).single<ChannelRow>()
    if (error?.code === UNIQUE_VIOLATION && name) throw new AppError('channelNameTaken', { name })
    if (error || !data) throw new Error(`Failed to update the channel: ${error?.message}`)
    return toChannel(data)
}

export async function archiveChannel(scope: WorkScope, author: WorkAuthor, channelId: string): Promise<Channel> {
    const channel = await readOpenChannel(scope, channelId)
    if (channel.kind === 'dm') throw new AppError('channelDirectMessageFixed')
    const { data, error } = await clientOf(scope)
        .from('channels')
        .update<ChannelUpdate>({ archived_at: new Date().toISOString() })
        .eq('id', channelId)
        .eq('workspace_id', scope.workspaceId)
        .select(CHANNEL_RETURNING)
        .single<ChannelRow>()
    if (error || !data) throw new Error(`Failed to archive the channel: ${error?.message}`)
    await recordActivity(scope, { action: 'channel.archived', entityType: 'channel', entityId: channelId, projectId: data.project_id, author, metadata: { name: data.name } })
    return toChannel(data)
}

// Nobody lands on an empty list: a workspace with no channel at all gets #general the first time
// someone opens it, and a person in no channel yet joins #general, the way everyone starts there.
// Two people creating it at once race on the name index: the loser reads the winner's.
export async function ensureGeneralChannel(scope: WorkScope, person: ChannelPerson): Promise<void> {
    const supabase = clientOf(scope)
    const me: WorkMemberRef = { kind: 'user', userId: person.userId }
    const [{ data: mine }, { data: general }] = await Promise.all([
        selectMany(supabase, 'channel_members', ['id'] as const, { workspace_id: scope.workspaceId, user_id: person.userId }, undefined, 1),
        selectMaybeSingle(supabase, 'channels', ['id'] as const, { workspace_id: scope.workspaceId, name: GENERAL_CHANNEL_NAME, kind: 'public', archived_at: { isNull: true } }),
    ])
    if (mine && mine.length > 0) return
    if (general) return insertMember(scope, general.id, me, new Date().toISOString())

    const { data: any } = await selectMany(supabase, 'channels', ['id'] as const, { workspace_id: scope.workspaceId }, undefined, 1)
    if (any && any.length > 0) return
    try {
        const row = await insertChannel(scope, { name: GENERAL_CHANNEL_NAME, description: null, kind: 'public', projectId: null, teamId: null, createdBy: null })
        await insertMember(scope, row.id, me, new Date().toISOString())
        await recordActivity(scope, { action: 'channel.created', entityType: 'channel', entityId: row.id, author: { kind: 'system' }, metadata: { name: row.name, kind: row.kind } })
    } catch (err) {
        if (!(err instanceof AppError && err.code === 'channelNameTaken')) throw err
    }
}

// Every open channel the person sees, with its unread count for them and its last message.
export async function listChannelsFor(scope: WorkScope, person: ChannelPerson): Promise<ChannelListItem[]> {
    await ensureGeneralChannel(scope, person)
    const supabase = clientOf(scope)
    const [{ data: channels, error }, { data: summaries, error: summaryError }] = await Promise.all([
        selectAll(supabase, 'channels', CHANNEL_COLUMNS, { workspace_id: scope.workspaceId, archived_at: { isNull: true } }, { column: 'created_at', ascending: true }),
        supabase.rpc('channel_summaries', { p_workspace_id: scope.workspaceId, p_user_id: person.userId }),
    ])
    if (error) throw new Error(`Failed to list the channels: ${error.message}`)
    if (summaryError) throw new Error(`Failed to count the unread messages: ${summaryError.message}`)

    const members = await readMembers(scope, (channels ?? []).map(channel => channel.id))
    const joined = new Set(members.filter(member => member.user_id === person.userId).map(member => member.channel_id))
    const visible = (channels ?? []).flatMap(channel => {
        const access = channelAccessOf(person, channel, joined.has(channel.id))
        return access === 'none' ? [] : [{ channel, access }]
    })

    const summaryOf = new Map((summaries ?? []).map(summary => [summary.channel_id, summary]))
    const lastIds = visible.flatMap(({ channel }) => summaryOf.get(channel.id)?.last_message_id ?? [])
    const { data: lastRows } = lastIds.length > 0 ? await selectMany(supabase, 'channel_messages', CHANNEL_MESSAGE_COLUMNS, { id: lastIds }) : { data: [] }
    const lastById = new Map((lastRows ?? []).map(row => [row.id, toChannelMessage(row)]))

    return visible.map(({ channel, access }) => {
        const summary = summaryOf.get(channel.id)
        return {
            ...toChannel(channel),
            access,
            isMember: joined.has(channel.id),
            unreadCount: summary?.unread_count ?? 0,
            lastMessage: summary?.last_message_id ? (lastById.get(summary.last_message_id) ?? null) : null,
            dmMembers: channel.kind === 'dm' ? members.filter(member => member.channel_id === channel.id).flatMap(member => memberRefOf(member.user_id, member.agent_id) ?? []) : [],
        }
    })
}

export async function listChannelMembers(scope: WorkScope, channelId: string): Promise<ChannelMemberView[]> {
    const rows = await readMembers(scope, [channelId])
    return rows.flatMap(row => {
        const member = memberRefOf(row.user_id, row.agent_id)
        return member ? [{ id: row.id, member, joinedAt: row.created_at }] : []
    })
}

export async function joinChannel(scope: WorkScope, person: ChannelPerson, channelId: string): Promise<void> {
    const channel = await readOpenChannel(scope, channelId)
    if (channel.kind !== 'public') throw new AppError('channelNotPublic')
    await insertMember(scope, channelId, { kind: 'user', userId: person.userId }, new Date().toISOString())
}

export async function leaveChannel(scope: WorkScope, person: ChannelPerson, channelId: string): Promise<void> {
    const channel = await readChannel(scope, channelId)
    if (channel.kind === 'dm') throw new AppError('channelDirectMessageFixed')
    const { error } = await clientOf(scope).from('channel_members').delete().eq('channel_id', channelId).eq('user_id', person.userId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to leave the channel: ${error.message}`)
}

export async function addChannelMembers(scope: WorkScope, channelId: string, refs: WorkMemberRef[]): Promise<void> {
    const channel = await readOpenChannel(scope, channelId)
    if (channel.kind === 'dm') throw new AppError('channelDirectMessageFixed')
    for (const ref of refs) await assertMemberInWorkspace(scope, ref)
    for (const ref of refs) await insertMember(scope, channelId, ref, null)
}

export async function removeChannelMember(scope: WorkScope, channelId: string, ref: WorkMemberRef): Promise<void> {
    const channel = await readChannel(scope, channelId)
    if (channel.kind === 'dm') throw new AppError('channelDirectMessageFixed')
    const query = clientOf(scope).from('channel_members').delete().eq('channel_id', channelId).eq('workspace_id', scope.workspaceId)
    const { error } = await (ref.kind === 'user' ? query.eq('user_id', ref.userId) : query.eq('agent_id', ref.agentId))
    if (error) throw new Error(`Failed to remove the channel member: ${error.message}`)
}

// The direct message between the person and one other member, opened the first time it is asked
// for. A direct message holds exactly those two, so a group conversation is never mistaken for it.
export async function openDirectMessage(scope: WorkScope, person: ChannelPerson, other: WorkMemberRef): Promise<Channel> {
    const me: WorkMemberRef = { kind: 'user', userId: person.userId }
    if (sameMember(me, other)) throw new AppError('directMessageWithSelf')
    await assertMemberInWorkspace(scope, other)
    const supabase = clientOf(scope)

    const { data: mine } = await selectAll(supabase, 'channel_members', ['channel_id'] as const, { workspace_id: scope.workspaceId, user_id: person.userId })
    const myChannelIds = (mine ?? []).map(row => row.channel_id)
    if (myChannelIds.length > 0) {
        const { data: dms } = await selectAll(supabase, 'channels', CHANNEL_COLUMNS, { workspace_id: scope.workspaceId, kind: 'dm', id: myChannelIds })
        const members = await readMembers(scope, (dms ?? []).map(dm => dm.id))
        const existing = (dms ?? []).find(dm => {
            const refs = members.filter(member => member.channel_id === dm.id).flatMap(member => memberRefOf(member.user_id, member.agent_id) ?? [])
            return refs.length === 2 && refs.some(ref => sameMember(ref, other))
        })
        if (existing) return toChannel(existing)
    }

    const row = await insertChannel(scope, { name: '', description: null, kind: 'dm', projectId: null, teamId: null, createdBy: person.userId })
    await insertMember(scope, row.id, me, new Date().toISOString())
    await insertMember(scope, row.id, other, null)
    return toChannel(row)
}

async function readMessage(scope: WorkScope, messageId: string): Promise<ChannelMessageRow> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'channel_messages', CHANNEL_MESSAGE_COLUMNS, { id: messageId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('channelMessageNotFound')
    return data
}

export async function getChannelMessage(scope: WorkScope, messageId: string): Promise<ChannelMessage> {
    return toChannelMessage(await readMessage(scope, messageId))
}

function dedupeRefs(refs: WorkMemberRef[]): WorkMemberRef[] {
    return refs.filter((ref, index) => refs.findIndex(other => sameMember(other, ref)) === index)
}

// What a message mentions: the people and coworkers the composer picked, each checked against the
// workspace, and any `@handle` of a coworker written in the text (a coworker posting through a tool
// writes handles, not ids). A handle that names nobody stays plain text, and so does a coworker the
// author may not see (`mentionable`, from `visibleAgentIds` for a person): it is not summoned, and the
// message tells nobody it exists.
export async function resolveMentions(scope: WorkScope, body: string, picked: WorkMemberRef[], mentionable: 'all' | Set<string> = 'all'): Promise<WorkMemberRef[]> {
    const supabase = clientOf(scope)
    const people = picked.flatMap(ref => (ref.kind === 'user' ? [ref.userId] : []))
    const agentIds = picked.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : []))
    const handles = [...new Set([...body.matchAll(HANDLE_MENTION)].map(match => match[1].toLowerCase()))]

    const [{ data: members }, { data: agents }] = await Promise.all([
        people.length > 0 ? selectMany(supabase, 'workspace_members', ['user_id'] as const, { workspace_id: scope.workspaceId, user_id: people }) : Promise.resolve({ data: [] }),
        agentIds.length > 0 || handles.length > 0 ? selectAll(supabase, 'agents', ['id', 'handle'] as const, { workspace_id: scope.workspaceId }) : Promise.resolve({ data: [] }),
    ])
    const knownPeople = new Set((members ?? []).map(member => member.user_id))
    if (people.some(id => !knownPeople.has(id))) throw new AppError('mentionNotInWorkspace')
    const seen = (agents ?? []).filter(agent => mentionable === 'all' || mentionable.has(agent.id))
    const seenIds = new Set(seen.map(agent => agent.id))

    const keptPicks = picked.filter(ref => ref.kind === 'user' || seenIds.has(ref.agentId))
    const byHandle = seen.flatMap(agent => (agent.handle && handles.includes(agent.handle.toLowerCase()) ? [{ kind: 'agent' as const, agentId: agent.id }] : []))
    return dedupeRefs([...keptPicks, ...byHandle])
}

// A reply always answers a top-level message: answering a reply joins the thread it belongs to.
async function threadRootOf(scope: WorkScope, channelId: string, parentMessageId: string): Promise<string> {
    const parent = await readMessage(scope, parentMessageId)
    if (parent.channel_id !== channelId) throw new AppError('channelMessageNotFound')
    return parent.parent_message_id ?? parent.id
}

async function markRead(scope: WorkScope, channelId: string, userId: string, at: string): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_members')
        .update<Database['public']['Tables']['channel_members']['Update']>({ last_read_at: at })
        .eq('channel_id', channelId)
        .eq('user_id', userId)
        .eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to mark the channel read: ${error.message}`)
}

export async function markChannelRead(scope: WorkScope, person: ChannelPerson, channelId: string): Promise<void> {
    await markRead(scope, channelId, person.userId, new Date().toISOString())
}

// A person who writes in a public channel they have not joined joins it: they would not see its
// unread messages otherwise. Their own message is read the moment it is written.
// `mentionable`: the coworkers the author may mention, see resolveMentions. A person's message passes
// the ones they see; a coworker's own answer may name any.
export async function postChannelMessage(scope: WorkScope, author: WorkAuthor, channelId: string, input: PostChannelMessageInput, mentionable: 'all' | Set<string> = 'all'): Promise<ChannelMessage> {
    const fields = parseWorkInput(postChannelMessageInputSchema, input)
    await readOpenChannel(scope, channelId)
    const parentMessageId = fields.parentMessageId ? await threadRootOf(scope, channelId, fields.parentMessageId) : null
    const mentions = await resolveMentions(scope, fields.body, fields.mentions ?? [], mentionable)

    const writer = authorColumns(author)
    const { data, error } = await clientOf(scope)
        .from('channel_messages')
        .insert<Database['public']['Tables']['channel_messages']['Insert']>({
            channel_id: channelId,
            workspace_id: scope.workspaceId,
            author_user_id: writer.userId,
            author_agent_id: writer.agentId,
            body: fields.body,
            parent_message_id: parentMessageId,
            mentions,
        })
        .select(MESSAGE_RETURNING)
        .single<ChannelMessageRow>()
    if (error || !data) throw new Error(`Failed to post the message: ${error?.message}`)

    if (author.kind === 'user') {
        if (await isChannelMember(scope, channelId, author)) await markRead(scope, channelId, author.userId, data.created_at)
        else await insertMember(scope, channelId, author, data.created_at)
    }
    return toChannelMessage(data)
}

function isAuthor(author: WorkAuthor, row: Pick<ChannelMessageRow, 'author_user_id' | 'author_agent_id'>): boolean {
    if (author.kind === 'user') return row.author_user_id === author.userId
    if (author.kind === 'agent') return row.author_agent_id === author.agentId
    return false
}

// Only the one who wrote a message rewrites it. An edit sets no coworker off.
export async function editChannelMessage(scope: WorkScope, author: WorkAuthor, messageId: string, input: Pick<PostChannelMessageInput, 'body' | 'mentions'>, mentionable: 'all' | Set<string> = 'all'): Promise<ChannelMessage> {
    const fields = parseWorkInput(postChannelMessageInputSchema.pick({ body: true, mentions: true }), input)
    const message = await readMessage(scope, messageId)
    if (message.deleted_at) throw new AppError('channelMessageNotFound')
    if (!isAuthor(author, message)) throw new AppError('channelMessageAuthorOnly')
    const mentions = await resolveMentions(scope, fields.body, fields.mentions ?? [], mentionable)

    const { data, error } = await clientOf(scope)
        .from('channel_messages')
        .update<ChannelMessageUpdate>({ body: fields.body, mentions, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('workspace_id', scope.workspaceId)
        .select(MESSAGE_RETURNING)
        .single<ChannelMessageRow>()
    if (error || !data) throw new Error(`Failed to edit the message: ${error?.message}`)
    return toChannelMessage(data)
}

// The row stays, so a thread keeps its place, but its words are gone for good. Its author deletes
// it, and so does whoever manages the channel.
export async function deleteChannelMessage(scope: WorkScope, author: WorkAuthor, messageId: string, canManage: boolean): Promise<ChannelMessage> {
    const message = await readMessage(scope, messageId)
    if (message.deleted_at) return toChannelMessage(message)
    if (!canManage && !isAuthor(author, message)) throw new AppError('channelMessageAuthorOnly')
    const { data, error } = await clientOf(scope)
        .from('channel_messages')
        .update<ChannelMessageUpdate>({ body: '', mentions: [], deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('workspace_id', scope.workspaceId)
        .select(MESSAGE_RETURNING)
        .single<ChannelMessageRow>()
    if (error || !data) throw new Error(`Failed to delete the message: ${error?.message}`)
    return toChannelMessage(data)
}

async function threadSummaries(scope: WorkScope, rootIds: string[]): Promise<Map<string, ChannelThreadSummary>> {
    const summaries = new Map<string, ChannelThreadSummary>()
    if (rootIds.length === 0) return summaries
    const { data, error } = await selectAll(clientOf(scope), 'channel_messages', ['parent_message_id', 'author_user_id', 'author_agent_id', 'created_at', 'deleted_at'] as const, { workspace_id: scope.workspaceId, parent_message_id: rootIds }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to read the threads: ${error.message}`)
    for (const reply of data ?? []) {
        if (!reply.parent_message_id || reply.deleted_at) continue
        const summary = summaries.get(reply.parent_message_id) ?? { replyCount: 0, lastReplyAt: reply.created_at, replyAuthors: [] }
        summary.replyCount += 1
        summary.lastReplyAt = reply.created_at
        const author = memberRefOf(reply.author_user_id, reply.author_agent_id)
        if (author && summary.replyAuthors.length < MAX_THREAD_AUTHORS && !summary.replyAuthors.some(known => known.kind !== 'system' && sameMember(known, author))) summary.replyAuthors.push(author)
        summaries.set(reply.parent_message_id, summary)
    }
    return summaries
}

// The newest top-level messages first read, handed back oldest first; `before` (the createdAt of
// the oldest message held) pages further back.
export async function listChannelMessages(scope: WorkScope, channelId: string, options: { before?: string | null; limit?: number } = {}): Promise<ChannelMessagePage> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_MESSAGE_PAGE, 1), MAX_MESSAGE_PAGE)
    const { data, error } = await selectMany(
        clientOf(scope),
        'channel_messages',
        CHANNEL_MESSAGE_COLUMNS,
        { channel_id: channelId, workspace_id: scope.workspaceId, parent_message_id: { isNull: true }, created_at: options.before ? { lt: options.before } : undefined },
        { column: 'created_at', ascending: false },
        limit + 1,
    )
    if (error) throw new Error(`Failed to read the messages: ${error.message}`)
    const rows = (data ?? []).slice(0, limit).reverse()
    const threads = await threadSummaries(scope, rows.map(row => row.id))
    return {
        messages: rows.map(row => ({ ...toChannelMessage(row), thread: threads.get(row.id) ?? null })),
        nextCursor: (data ?? []).length > limit ? (rows[0]?.created_at ?? null) : null,
    }
}

export async function listThread(scope: WorkScope, channelId: string, rootMessageId: string): Promise<{ root: ChannelMessage; replies: ChannelMessage[] }> {
    const root = await readMessage(scope, rootMessageId)
    if (root.channel_id !== channelId || root.parent_message_id) throw new AppError('channelMessageNotFound')
    const { data, error } = await selectAll(clientOf(scope), 'channel_messages', CHANNEL_MESSAGE_COLUMNS, { channel_id: channelId, workspace_id: scope.workspaceId, parent_message_id: rootMessageId }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to read the thread: ${error.message}`)
    return { root: toChannelMessage(root), replies: (data ?? []).map(toChannelMessage) }
}

export type ChannelCoworker = { id: string; name: string; handle: string | null }

// The names of the coworkers a screen shows in a channel (members, authors), Box or not: whoever
// reads the channel reads what they wrote.
export async function channelCoworkers(scope: WorkScope, agentIds: string[]): Promise<ChannelCoworker[]> {
    const ids = [...new Set(agentIds)]
    if (ids.length === 0) return []
    const { data, error } = await selectMany(clientOf(scope), 'agents', ['id', 'name', 'handle'] as const, { id: ids, workspace_id: scope.workspaceId })
    if (error) throw new Error(`Failed to read the coworkers: ${error.message}`)
    return data ?? []
}

export function authorAgentsOf(messages: ChannelMessage[]): string[] {
    return messages.flatMap(message => (message.author.kind === 'agent' ? [message.author.agentId] : []))
}

export type ChannelLinks = { project: { id: string; key: string; name: string } | null; team: { id: string; name: string } | null }

// What the channel links to, as `reader` may see it: a project they cannot see is not named.
export async function channelLinks(scope: WorkScope, channel: Pick<Channel, 'projectId' | 'teamId'>, reader: Actor): Promise<ChannelLinks> {
    const supabase = clientOf(scope)
    const [{ data: project }, { data: team }] = await Promise.all([
        channel.projectId ? selectMaybeSingle(supabase, 'projects', ['id', 'key', 'name', 'workspace_id', 'visibility'] as const, { id: channel.projectId, workspace_id: scope.workspaceId }) : Promise.resolve({ data: null }),
        channel.teamId ? selectMaybeSingle(supabase, 'teams', ['id', 'name'] as const, { id: channel.teamId, workspace_id: scope.workspaceId }) : Promise.resolve({ data: null }),
    ])
    const shown = project && (await projectAccessFor(reader, project)) !== 'none' ? { id: project.id, key: project.key, name: project.name } : null
    return { project: shown, team: team ?? null }
}
