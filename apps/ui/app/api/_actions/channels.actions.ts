'use server'

import { workMemberRefSchema, type Channel, type ChannelMessage, type CreateChannelInput, type PostChannelMessageInput, type UpdateChannelInput, type WorkMemberRef } from '@lumvika/contracts'
import { z } from 'zod'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { assertAgentAccess, keepVisible, requireLightSessionActor, visibleAgentIds, type Actor } from '@/app/api/_auth/access'
import { assertChannelAccess, assertProjectAccess, type ChannelAccess } from '@/app/api/_auth/project-access'
import { isSummonable, listChannelTurns, reactToChannelMessage, runAfterResponse, summonCoworkers, type ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import {
    addChannelMembers,
    authorAgentsOf,
    archiveChannel,
    channelCoworkers,
    channelLinks,
    createChannel,
    deleteChannelMessage,
    editChannelMessage,
    getChannel,
    getChannelMessage,
    joinChannel,
    leaveChannel,
    listChannelMembers,
    listChannelMessages,
    listChannelsFor,
    listThread,
    markChannelRead,
    openDirectMessage,
    postChannelMessage,
    removeChannelMember,
    updateChannel,
    type ChannelCoworker,
    type ChannelLinks,
    type ChannelListItem,
    type ChannelMemberView,
    type ChannelMessagePage,
    type ChannelPerson,
} from '@/app/api/_services/work/channels.service'
import { parseWorkInput, sameMember, type WorkScope } from '@/app/api/_services/work/refs'
import { failureOf, type ActionFailure } from '@/lib/i18n/action-error'

export type ChannelActionResult<T = unknown> = ({ ok: true } & T) | ActionFailure

export type ChannelDetail = Channel & ChannelLinks & { access: Exclude<ChannelAccess, 'none'>; isMember: boolean; members: ChannelMemberView[]; coworkers: ChannelCoworker[] }
export type ChannelMessagesView = ChannelMessagePage & { turns: ChannelAgentTurn[]; coworkers: ChannelCoworker[] }
export type ChannelThreadView = { root: ChannelMessage; replies: ChannelMessage[]; coworkers: ChannelCoworker[] }
// The coworkers a message mentions that are not in the channel, and whether the person may add them.
export type PostedChannelMessage = { message: ChannelMessage; outsiders: ChannelCoworker[]; canAddOutsiders: boolean }


// Channels are a person's space: the workspace acting through a key reads them through the API, not
// through these screens.
async function requirePerson(): Promise<ChannelPerson> {
    const actor: Actor = await requireLightSessionActor()
    if (actor.kind !== 'user') throw new AuthorizationError('notAuthorized')
    return actor
}

function scopeOf(person: ChannelPerson): WorkScope {
    return { workspaceId: person.workspaceId }
}

async function personOn(channelId: string, need: 'use' | 'manage') {
    const person = await requirePerson()
    const { access, channel } = await assertChannelAccess(channelId, need, person)
    return { person, access, channel, scope: scopeOf(person) }
}

// As many as a channel holds when it is created, each once.
const addedMembersSchema = z.array(workMemberRefSchema).min(1).max(500)

function agentsMentioned(messages: ChannelMessage[]): string[] {
    return messages.flatMap(message => message.mentions.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : [])))
}

// The coworkers a reader gets names for. Whoever reads a channel reads what its coworkers wrote and
// sees who answers there, so those are named whatever their Box; a coworker only mentioned is named
// to a reader who reaches its Box, and stays plain text to anyone else.
async function coworkersSeenBy(scope: WorkScope, person: ChannelPerson, named: string[], mentioned: string[]): Promise<ChannelCoworker[]> {
    const always = new Set(named)
    const onlyMentioned = [...new Set(mentioned)].filter(agentId => !always.has(agentId))
    const visible = onlyMentioned.length > 0 ? await visibleAgentIds(person) : 'all'
    return channelCoworkers(scope, [...always, ...keepVisible(onlyMentioned, visible, agentId => agentId)])
}

// A project is linked to a channel by someone who uses it: one they cannot see does not exist.
async function assertLinkable(person: ChannelPerson, projectId: string | null | undefined): Promise<void> {
    if (projectId) await assertProjectAccess(projectId, 'use', person)
}

// Adding someone to a public channel is open to whoever uses it; a private one is its manager's.
// A coworker is only added by someone who reaches it through its Box.
async function assertCanAdd(channelId: string, refs: WorkMemberRef[]) {
    const guard = await personOn(channelId, 'use')
    if (guard.channel.kind !== 'public') await assertChannelAccess(channelId, 'manage', guard.person)
    for (const ref of refs) if (ref.kind === 'agent') await assertAgentAccess(ref.agentId, 'use', guard.person)
    return guard
}

export async function listChannelsAction(): Promise<ChannelActionResult<{ channels: ChannelListItem[]; userId: string }>> {
    try {
        const person = await requirePerson()
        return { ok: true, channels: await listChannelsFor(scopeOf(person), person), userId: person.userId }
    } catch (err) {
        return failureOf(err)
    }
}

export async function getChannelAction(channelId: string): Promise<ChannelActionResult<{ channel: ChannelDetail }>> {
    try {
        const { person, access, scope } = await personOn(channelId, 'use')
        const [channel, members] = await Promise.all([getChannel(scope, channelId), listChannelMembers(scope, channelId)])
        const [links, coworkers] = await Promise.all([channelLinks(scope, channel, person), channelCoworkers(scope, members.flatMap(row => (row.member.kind === 'agent' ? [row.member.agentId] : [])))])
        const isMember = members.some(row => row.member.kind === 'user' && row.member.userId === person.userId)
        return { ok: true, channel: { ...channel, ...links, access: access === 'manage' ? 'manage' : 'use', isMember, members, coworkers } }
    } catch (err) {
        return failureOf(err)
    }
}

export async function listChannelMessagesAction(channelId: string, before?: string | null): Promise<ChannelActionResult<ChannelMessagesView>> {
    try {
        const { person, scope } = await personOn(channelId, 'use')
        const [page, turns] = await Promise.all([listChannelMessages(scope, channelId, { before }), before ? Promise.resolve([]) : listChannelTurns(scope, channelId)])
        const named = [...authorAgentsOf(page.messages), ...page.messages.flatMap(message => message.thread?.replyAuthors.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : [])) ?? []), ...turns.map(turn => turn.agentId)]
        const coworkers = await coworkersSeenBy(scope, person, named, agentsMentioned(page.messages))
        return { ok: true, ...page, turns, coworkers }
    } catch (err) {
        return failureOf(err)
    }
}

export async function getChannelThreadAction(channelId: string, rootMessageId: string): Promise<ChannelActionResult<ChannelThreadView>> {
    try {
        const { person, scope } = await personOn(channelId, 'use')
        const thread = await listThread(scope, channelId, rootMessageId)
        const messages = [thread.root, ...thread.replies]
        return { ok: true, ...thread, coworkers: await coworkersSeenBy(scope, person, authorAgentsOf(messages), agentsMentioned(messages)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createChannelAction(input: CreateChannelInput): Promise<ChannelActionResult<{ channel: Channel }>> {
    try {
        const person = await requirePerson()
        for (const ref of input.members ?? []) if (ref.kind === 'agent') await assertAgentAccess(ref.agentId, 'use', person)
        await assertLinkable(person, input.projectId)
        return { ok: true, channel: await createChannel(scopeOf(person), person, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateChannelAction(channelId: string, input: UpdateChannelInput): Promise<ChannelActionResult<{ channel: Channel }>> {
    try {
        const { person, scope } = await personOn(channelId, 'manage')
        await assertLinkable(person, input.projectId)
        return { ok: true, channel: await updateChannel(scope, channelId, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function archiveChannelAction(channelId: string): Promise<ChannelActionResult> {
    try {
        const { person, scope } = await personOn(channelId, 'manage')
        await archiveChannel(scope, { kind: 'user', userId: person.userId }, channelId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function joinChannelAction(channelId: string): Promise<ChannelActionResult> {
    try {
        const { person, scope } = await personOn(channelId, 'use')
        await joinChannel(scope, person, channelId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function leaveChannelAction(channelId: string): Promise<ChannelActionResult> {
    try {
        const { person, scope } = await personOn(channelId, 'use')
        await leaveChannel(scope, person, channelId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

// `answerMessageId`: the message that mentioned the coworkers being added, which they then answer.
export async function addChannelMembersAction(channelId: string, members: WorkMemberRef[], answerMessageId?: string): Promise<ChannelActionResult> {
    try {
        const listed = parseWorkInput(addedMembersSchema, members)
        const refs = listed.filter((ref, index) => listed.findIndex(other => sameMember(other, ref)) === index)
        const { person, scope } = await assertCanAdd(channelId, refs)
        await addChannelMembers(scope, channelId, refs)
        if (answerMessageId) {
            const message = await getChannelMessage(scope, answerMessageId)
            const summoned = refs.flatMap(ref => (ref.kind === 'agent' && message.channelId === channelId && isSummonable(message, ref.agentId) ? [ref.agentId] : []))
            if (summoned.length > 0) runAfterResponse(() => summonCoworkers(scope, person, message, summoned))
        }
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function removeChannelMemberAction(channelId: string, ref: WorkMemberRef): Promise<ChannelActionResult> {
    try {
        const { scope } = await personOn(channelId, 'manage')
        await removeChannelMember(scope, channelId, ref)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function openDirectMessageAction(other: WorkMemberRef): Promise<ChannelActionResult<{ channel: Channel }>> {
    try {
        const person = await requirePerson()
        if (other.kind === 'agent') await assertAgentAccess(other.agentId, 'use', person)
        return { ok: true, channel: await openDirectMessage(scopeOf(person), person, other) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function postChannelMessageAction(channelId: string, input: PostChannelMessageInput): Promise<ChannelActionResult<PostedChannelMessage>> {
    try {
        const { person, access, channel, scope } = await personOn(channelId, 'use')
        const mentionable = await visibleAgentIds(person)
        const message = await postChannelMessage(scope, { kind: 'user', userId: person.userId }, channelId, input, mentionable)
        const summons = await reactToChannelMessage(scope, person, message)
        const outsiders = await channelCoworkers(scope, keepVisible(summons.outsiders, mentionable, agentId => agentId))
        const canAddOutsiders = channel.kind === 'public' || (channel.kind === 'private' && access === 'manage')
        return { ok: true, message, outsiders, canAddOutsiders }
    } catch (err) {
        return failureOf(err)
    }
}

async function personOnMessage(messageId: string) {
    const person = await requirePerson()
    const message = await getChannelMessage(scopeOf(person), messageId)
    const { access } = await assertChannelAccess(message.channelId, 'use', person)
    return { person, access, scope: scopeOf(person) }
}

export async function editChannelMessageAction(messageId: string, input: Pick<PostChannelMessageInput, 'body' | 'mentions'>): Promise<ChannelActionResult<{ message: ChannelMessage }>> {
    try {
        const { person, scope } = await personOnMessage(messageId)
        return { ok: true, message: await editChannelMessage(scope, { kind: 'user', userId: person.userId }, messageId, input, await visibleAgentIds(person)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function deleteChannelMessageAction(messageId: string): Promise<ChannelActionResult<{ message: ChannelMessage }>> {
    try {
        const { person, access, scope } = await personOnMessage(messageId)
        return { ok: true, message: await deleteChannelMessage(scope, { kind: 'user', userId: person.userId }, messageId, access === 'manage') }
    } catch (err) {
        return failureOf(err)
    }
}

export async function markChannelReadAction(channelId: string): Promise<ChannelActionResult> {
    try {
        const { person, scope } = await personOn(channelId, 'use')
        await markChannelRead(scope, person, channelId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
