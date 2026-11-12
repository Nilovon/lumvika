'use server'

import type { AssistantChat, CreateAssistantChatInput, UpdateAssistantChatInput } from '@lumvika/contracts'
import type { UIMessage } from 'ai'

import { actorFromContext, type Actor } from '@/app/api/_auth/access'
import { requireWorkspaceContext, type WorkspaceContext } from '@/app/api/_auth/ownership'
import { projectAccessMap } from '@/app/api/_auth/project-access'
import { assistantAvailability, assistantEngineOf, readAssistantRunState, readAssistantTranscript, type AssistantAvailability } from '@/app/api/_services/assistant-engine.service'
import { listMemberProfiles } from '@/app/api/_services/members.service'
import {
    archiveAssistantChat,
    createAssistantChat,
    deleteAssistantChat,
    getAssistantChat,
    listAssistantChats,
    updateAssistantChat,
    type AssistantChatAccess,
    type AssistantChatList,
} from '@/app/api/_services/work/assistant-chats.service'
import { toAssistantChat } from '@/app/api/_services/work/mappers'
import { failureOf } from '@/lib/i18n/action-error'
import { selectAll } from '@/supabase/supabase-helpers'
import type { ActionResult } from './space.actions'

export type AssistantProjectOption = { id: string; key: string; name: string }

export type AssistantHome = AssistantChatList & {
    availability: AssistantAvailability
    // Who started each chat shared with the caller, by user id.
    owners: Record<string, string | null>
    projects: AssistantProjectOption[]
    isAdmin: boolean
}

export type OpenedAssistantChat = {
    chat: AssistantChat
    access: AssistantChatAccess
    ownerName: string | null
    messages: UIMessage[]
    activeRunId: string | null
    lastError: string | null
    // The transcript could not be read: the engine is asleep, gone or too old.
    transcriptUnavailable: boolean
}

async function caller(): Promise<{ ctx: WorkspaceContext; actor: Actor; scope: { workspaceId: number } }> {
    const ctx = await requireWorkspaceContext()
    return { ctx, actor: actorFromContext(ctx), scope: { workspaceId: ctx.workspace.id } }
}

async function visibleProjects(ctx: WorkspaceContext, actor: Actor): Promise<AssistantProjectOption[]> {
    const [{ data }, access] = await Promise.all([
        selectAll(ctx.supabase, 'projects', ['id', 'key', 'name'] as const, { workspace_id: ctx.workspace.id, archived_at: { isNull: true } }, { column: 'name', ascending: true }),
        projectAccessMap(actor),
    ])
    return (data ?? []).filter(project => (access.get(project.id) ?? 'none') !== 'none')
}

async function ownerNames(ctx: WorkspaceContext, chats: AssistantChat[]): Promise<Record<string, string | null>> {
    if (chats.length === 0) return {}
    const profiles = await listMemberProfiles(ctx)
    const wanted = new Set(chats.map(chat => chat.userId))
    return Object.fromEntries(profiles.filter(profile => wanted.has(profile.id)).map(profile => [profile.id, profile.name]))
}

export async function loadAssistantHomeAction(): Promise<ActionResult<{ home: AssistantHome }>> {
    try {
        const { ctx, actor, scope } = await caller()
        const [chats, { availability }, projects] = await Promise.all([listAssistantChats(scope, actor), assistantAvailability(scope.workspaceId), visibleProjects(ctx, actor)])
        return { ok: true, home: { ...chats, availability, owners: await ownerNames(ctx, chats.shared), projects, isAdmin: ctx.role === 'admin' } }
    } catch (err) {
        return failureOf(err)
    }
}

export async function openAssistantChatAction(chatId: string): Promise<ActionResult<{ opened: OpenedAssistantChat }>> {
    try {
        const { ctx, actor, scope } = await caller()
        const { row, access } = await getAssistantChat(scope, actor, chatId)
        const ownerName = access === 'owner' ? null : ((await ownerNames(ctx, [toAssistantChat(row)]))[row.user_id] ?? null)
        const base = { chat: toAssistantChat(row), access, ownerName }
        if (!row.engine_session_id) return { ok: true, opened: { ...base, messages: [], activeRunId: null, lastError: null, transcriptUnavailable: false } }
        const conn = await assistantEngineOf(scope.workspaceId)
        if (!conn) return { ok: true, opened: { ...base, messages: [], activeRunId: null, lastError: null, transcriptUnavailable: true } }
        const [messages, runState] = await Promise.all([readAssistantTranscript(conn, row.engine_session_id).catch(() => null), readAssistantRunState(conn, row.engine_session_id).catch(() => ({ activeRunId: null, lastError: null }))])
        return { ok: true, opened: { ...base, messages: messages ?? [], ...runState, transcriptUnavailable: messages === null } }
    } catch (err) {
        return failureOf(err)
    }
}

// The transcript of a chat again, once a run the screen was following is over.
export async function readAssistantMessagesAction(chatId: string): Promise<UIMessage[]> {
    try {
        const { actor, scope } = await caller()
        const { row } = await getAssistantChat(scope, actor, chatId)
        const conn = row.engine_session_id ? await assistantEngineOf(scope.workspaceId) : null
        return conn && row.engine_session_id ? await readAssistantTranscript(conn, row.engine_session_id) : []
    } catch {
        return []
    }
}

export async function createAssistantChatAction(input: CreateAssistantChatInput): Promise<ActionResult<{ chat: AssistantChat }>> {
    try {
        const { actor, scope } = await caller()
        return { ok: true, chat: toAssistantChat(await createAssistantChat(scope, actor, input)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateAssistantChatAction(chatId: string, input: UpdateAssistantChatInput): Promise<ActionResult<{ chat: AssistantChat }>> {
    try {
        const { actor, scope } = await caller()
        return { ok: true, chat: toAssistantChat(await updateAssistantChat(scope, actor, chatId, input)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function archiveAssistantChatAction(chatId: string, archived: boolean): Promise<ActionResult<{ chat: AssistantChat }>> {
    try {
        const { actor, scope } = await caller()
        return { ok: true, chat: toAssistantChat(await archiveAssistantChat(scope, actor, chatId, archived)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function deleteAssistantChatAction(chatId: string): Promise<ActionResult> {
    try {
        const { actor, scope } = await caller()
        await deleteAssistantChat(scope, actor, chatId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
