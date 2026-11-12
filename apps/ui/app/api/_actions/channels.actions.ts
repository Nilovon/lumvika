'use server'

import type { Channel, ChannelMessage, CreateChannelInput, PostChannelMessageInput, UpdateChannelInput, WorkMemberRef } from '@lumvika/contracts'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { assertAgentAccess, requireLightSessionActor, type Actor } from '@/app/api/_auth/access'
import { assertChannelAccess, type ChannelAccess } from '@/app/api/_auth/project-access'
import { isSummonable, listChannelTurns, reactToChannelMessage, runAfterResponse, summonCoworkers, type ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import {
    addChannelMembers,
    agentIdsOf,
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
import type { WorkScope } from '@/app/api/_services/work/refs'
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
        const [links, coworkers] = await Promise.all([channelLinks(scope, channel), channelCoworkers(scope, members.flatMap(row => (row.member.kind === 'agent' ? [row.member.agentId] : [])))])
        const isMember = members.some(row => row.member.kind === 'user' && row.member.userId === person.userId)
        return { ok: true, channel: { ...channel, ...links, access: access === 'manage' ? 'manage' : 'use', isMember, members, coworkers } }
    } catch (err) {
        return failureOf(err)
    }
}

export async function listChannelMessagesAction(channelId: string, before?: string | null): Promise<ChannelActionResult<ChannelMessagesView>> {
    try {
        const { scope } = await personOn(channelId, 'use')
        const [page, turns] = await Promise.all([listChannelMessages(scope, channelId, { before }), before ? Promise.resolve([]) : listChannelTurns(scope, channelId)])
        const coworkers = await channelCoworkers(scope, [...agentIdsOf(page.messages), ...page.messages.flatMap(message => message.thread?.replyAuthors.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : [])) ?? []), ...turns.map(turn => turn.agentId)])
        return { ok: true, ...page, turns, coworkers }
    } catch (err) {
        return failureOf(err)
    }
}

export async function getChannelThreadAction(channelId: string, rootMessageId: string): Promise<ChannelActionResult<ChannelThreadView>> {
    try {
        const { scope } = await personOn(channelId, 'use')
        const thread = await listThread(scope, channelId, rootMessageId)
        return { ok: true, ...thread, coworkers: await channelCoworkers(scope, agentIdsOf([thread.root, ...thread.replies])) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createChannelAction(input: CreateChannelInput): Promise<ChannelActionResult<{ channel: Channel }>> {
    try {
        const person = await requirePerson()
        for (const ref of input.members ?? []) if (ref.kind === 'agent') await assertAgentAccess(ref.agentId, 'use', person)
        return { ok: true, channel: await createChannel(scopeOf(person), person, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateChannelAction(channelId: string, input: UpdateChannelInput): Promise<ChannelActionResult<{ channel: Channel }>> {
    try {
        const { scope } = await personOn(channelId, 'manage')
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
export async function addChannelMembersAction(channelId: string, refs: WorkMemberRef[], answerMessageId?: string): Promise<ChannelActionResult> {
    try {
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
        const message = await postChannelMessage(scope, { kind: 'user', userId: person.userId }, channelId, input)
        const summons = await reactToChannelMessage(scope, person, message)
        const outsiders = await channelCoworkers(scope, summons.outsiders)
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
        return { ok: true, message: await editChannelMessage(scope, { kind: 'user', userId: person.userId }, messageId, input) }
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
