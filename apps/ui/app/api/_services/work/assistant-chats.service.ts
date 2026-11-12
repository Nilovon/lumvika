import 'server-only'

import { createAssistantChatInputSchema, updateAssistantChatInputSchema, type AssistantChat, type CreateAssistantChatInput, type UpdateAssistantChatInput } from '@lumvika/contracts'

import type { Actor } from '@/app/api/_auth/access'
import { projectAccessFor, visibleProjectIds } from '@/app/api/_auth/project-access'
import type { Database } from '@/app/api/database.types'
import { ASSISTANT_CHAT_COLUMNS, type AssistantChatRow } from '@/app/api/_services/work/columns'
import { toAssistantChat } from '@/app/api/_services/work/mappers'
import { clientOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { generateSessionTitle } from '@/lib/ai/generate-title'
import { AppError, type ErrorCode } from '@/lib/i18n/action-error'
import { selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

// A chat of the plain Chat area belongs to the person who started it. Shared, every member who sees
// its project (or any member, without one) reads it; only its owner writes in it or changes it. The
// rows are read and written with the service role, so these rules are the ones that hold: the RLS
// policy of `assistant_chats` says the same for a direct read from the browser.

type ChatUpdate = Database['public']['Tables']['assistant_chats']['Update']
type ChatInsert = Database['public']['Tables']['assistant_chats']['Insert']

export const ASSISTANT_CHAT_NOT_FOUND = 'assistantChatNotFound' satisfies ErrorCode
export const ASSISTANT_CHAT_READ_ONLY = 'assistantChatReadOnly' satisfies ErrorCode

const DEFAULT_TITLE = 'New chat'
const TITLE_SEED_CHARS = 2000
const FALLBACK_TITLE_CHARS = 60
const LIST_LIMIT = 500

export type AssistantChatAccess = 'owner' | 'reader'

export type AssistantChatList = { mine: AssistantChat[]; shared: AssistantChat[]; archived: AssistantChat[] }

function userIdOf(actor: Actor): string {
    if (actor.kind !== 'user') throw new AppError(ASSISTANT_CHAT_NOT_FOUND)
    return actor.userId
}

async function readRow(scope: WorkScope, chatId: string): Promise<AssistantChatRow | null> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'assistant_chats', ASSISTANT_CHAT_COLUMNS, { id: chatId, workspace_id: scope.workspaceId })
    return data
}

async function projectVisible(actor: Actor, scope: WorkScope, projectId: string): Promise<boolean> {
    const { data: project } = await selectMaybeSingle(clientOf(scope), 'projects', ['id', 'workspace_id', 'visibility'] as const, { id: projectId, workspace_id: scope.workspaceId })
    if (!project) return false
    return (await projectAccessFor(actor, project)) !== 'none'
}

async function assertProjectVisible(actor: Actor, scope: WorkScope, projectId: string | null | undefined): Promise<void> {
    if (projectId && !(await projectVisible(actor, scope, projectId))) throw new AppError('projectNotFound')
}

// The chat and what the caller may do with it. Someone else's chat that is not shared, or shared
// about a project the caller does not see, does not exist for them.
export async function getAssistantChat(scope: WorkScope, actor: Actor, chatId: string): Promise<{ row: AssistantChatRow; access: AssistantChatAccess }> {
    const userId = userIdOf(actor)
    const row = await readRow(scope, chatId)
    if (!row) throw new AppError(ASSISTANT_CHAT_NOT_FOUND)
    if (row.user_id === userId) return { row, access: 'owner' }
    if (!row.shared || row.archived_at) throw new AppError(ASSISTANT_CHAT_NOT_FOUND)
    if (row.project_id && !(await projectVisible(actor, scope, row.project_id))) throw new AppError(ASSISTANT_CHAT_NOT_FOUND)
    return { row, access: 'reader' }
}

// Every change, and every message, is the owner's alone: a reader of a shared chat is told so
// rather than told it does not exist.
export async function getOwnAssistantChat(scope: WorkScope, actor: Actor, chatId: string): Promise<AssistantChatRow> {
    const { row, access } = await getAssistantChat(scope, actor, chatId)
    if (access !== 'owner') throw new AppError(ASSISTANT_CHAT_READ_ONLY)
    return row
}

export async function createAssistantChat(scope: WorkScope, actor: Actor, input: CreateAssistantChatInput): Promise<AssistantChatRow> {
    const userId = userIdOf(actor)
    const fields = parseWorkInput(createAssistantChatInputSchema, input)
    await assertProjectVisible(actor, scope, fields.projectId)
    const { data, error } = await clientOf(scope)
        .from('assistant_chats')
        .insert<ChatInsert>({
            workspace_id: scope.workspaceId,
            user_id: userId,
            project_id: fields.projectId ?? null,
            title: fields.title || DEFAULT_TITLE,
            model: fields.model ?? null,
        })
        .select(ASSISTANT_CHAT_COLUMNS.join(','))
        .single<AssistantChatRow>()
    if (error || !data) throw new Error(`Failed to create the chat: ${error?.message}`)
    return data
}

// The caller's own chats, the ones shared with them by others and their own archived ones, newest
// activity first.
export async function listAssistantChats(scope: WorkScope, actor: Actor): Promise<AssistantChatList> {
    const userId = userIdOf(actor)
    const supabase = clientOf(scope)
    const order = { column: 'updated_at', ascending: false } as const
    const [{ data: own, error }, { data: shared }, visible] = await Promise.all([
        selectMany(supabase, 'assistant_chats', ASSISTANT_CHAT_COLUMNS, { workspace_id: scope.workspaceId, user_id: userId }, order, LIST_LIMIT),
        selectMany(supabase, 'assistant_chats', ASSISTANT_CHAT_COLUMNS, { workspace_id: scope.workspaceId, shared: true, user_id: { neq: userId }, archived_at: { isNull: true } }, order, LIST_LIMIT),
        visibleProjectIds(actor),
    ])
    if (error) throw new Error(`Failed to list the chats: ${error.message}`)
    const seesProject = (row: AssistantChatRow) => !row.project_id || visible === 'all' || visible.has(row.project_id)
    const byActivity = (a: AssistantChat, b: AssistantChat) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)
    const mine = (own ?? []).map(toAssistantChat).sort(byActivity)
    return {
        mine: mine.filter(chat => !chat.archivedAt),
        archived: mine.filter(chat => chat.archivedAt),
        shared: (shared ?? []).filter(seesProject).map(toAssistantChat).sort(byActivity),
    }
}

async function writeOwnChat(scope: WorkScope, actor: Actor, chatId: string, patch: ChatUpdate): Promise<AssistantChatRow> {
    const row = await getOwnAssistantChat(scope, actor, chatId)
    if (Object.keys(patch).length === 0) return row
    const { data, error } = await clientOf(scope)
        .from('assistant_chats')
        .update<ChatUpdate>(patch)
        .eq('id', chatId)
        .eq('workspace_id', scope.workspaceId)
        .eq('user_id', row.user_id)
        .select(ASSISTANT_CHAT_COLUMNS.join(','))
        .single<AssistantChatRow>()
    if (error || !data) throw new Error(`Failed to update the chat: ${error?.message}`)
    return data
}

export async function updateAssistantChat(scope: WorkScope, actor: Actor, chatId: string, input: UpdateAssistantChatInput): Promise<AssistantChatRow> {
    const fields = parseWorkInput(updateAssistantChatInputSchema, input)
    await assertProjectVisible(actor, scope, fields.projectId)
    return writeOwnChat(scope, actor, chatId, {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.projectId !== undefined ? { project_id: fields.projectId } : {}),
        ...(fields.model !== undefined ? { model: fields.model } : {}),
        ...(fields.shared !== undefined ? { shared: fields.shared } : {}),
    })
}

export async function archiveAssistantChat(scope: WorkScope, actor: Actor, chatId: string, archived: boolean): Promise<AssistantChatRow> {
    return writeOwnChat(scope, actor, chatId, { archived_at: archived ? new Date().toISOString() : null })
}

// What became of the conversation on the engine: erased, never started there, or still there because
// the server is too old to erase it or did not answer.
export type TranscriptErasure = 'erased' | 'none' | 'outdated' | 'unreachable'

// The transcript goes first, then the row. A server that cannot erase it does not keep the chat in
// the list: the person asked for it to go, and is told what stayed on the server.
export async function deleteAssistantChat(scope: WorkScope, actor: Actor, chatId: string, eraseTranscript: (engineSessionId: string) => Promise<Exclude<TranscriptErasure, 'none'>>): Promise<TranscriptErasure> {
    const row = await getOwnAssistantChat(scope, actor, chatId)
    const transcript = row.engine_session_id ? await eraseTranscript(row.engine_session_id) : 'none'
    const { error } = await clientOf(scope).from('assistant_chats').delete().eq('id', chatId).eq('workspace_id', scope.workspaceId).eq('user_id', row.user_id)
    if (error) throw new Error(`Failed to delete the chat: ${error.message}`)
    return transcript
}

// After a message reached the engine: the conversation it continues, when it last moved, and the
// model it ran on when one was picked.
export async function recordAssistantTurn(scope: WorkScope, row: AssistantChatRow, turn: { engineSessionId: string | null; model?: string }): Promise<void> {
    const patch: ChatUpdate = {
        last_message_at: new Date().toISOString(),
        ...(turn.engineSessionId && turn.engineSessionId !== row.engine_session_id ? { engine_session_id: turn.engineSessionId } : {}),
        ...(turn.model && turn.model !== row.model ? { model: turn.model.slice(0, 200) } : {}),
    }
    const { error } = await clientOf(scope).from('assistant_chats').update<ChatUpdate>(patch).eq('id', row.id).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to record the message: ${error.message}`)
}

// What a chat with no model at hand is named: the start of its first message, cut on a word.
export function fallbackTitle(text: string): string {
    const line = text.replace(/\s+/g, ' ').trim()
    if (line.length <= FALLBACK_TITLE_CHARS) return line
    const cut = line.slice(0, FALLBACK_TITLE_CHARS)
    const space = cut.lastIndexOf(' ')
    return `${(space > FALLBACK_TITLE_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// Named after its first message, the way a coworker conversation is. Without a title model (no hub
// key, a provider error) the start of the message stands in. A title the owner already changed is
// kept.
export async function titleAssistantChat(scope: WorkScope, row: AssistantChatRow, firstMessage: string, generate: (seed: string) => Promise<string> = generateSessionTitle): Promise<string | null> {
    if (row.title !== DEFAULT_TITLE) return null
    const seed = firstMessage.trim().slice(0, TITLE_SEED_CHARS)
    if (!seed) return null
    const generated = await generate(seed).catch(() => '')
    const title = (generated.trim() || fallbackTitle(seed)).slice(0, 200)
    const { error } = await clientOf(scope).from('assistant_chats').update<ChatUpdate>({ title }).eq('id', row.id).eq('workspace_id', scope.workspaceId).eq('title', DEFAULT_TITLE)
    if (error) return null
    return title
}

// The project a turn is about, for the assistant's context: only when the person sending it sees
// the project, so a chat moved out of their reach never carries its instructions.
export async function projectContextOf(scope: WorkScope, actor: Actor, row: AssistantChatRow): Promise<{ name: string; instructions: string } | null> {
    if (!row.project_id) return null
    const { data: project } = await selectMaybeSingle(clientOf(scope), 'projects', ['id', 'workspace_id', 'visibility', 'name', 'instructions'] as const, { id: row.project_id, workspace_id: scope.workspaceId })
    if (!project || (await projectAccessFor(actor, project)) === 'none') return null
    const instructions = project.instructions?.trim()
    return instructions ? { name: project.name, instructions } : null
}
