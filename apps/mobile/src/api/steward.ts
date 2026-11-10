import { stewardEngineConversationSchema, stewardEngineFilesSchema, stewardEngineMessagesSchema, stewardStateSchema, type ConversationMessage, type StewardStateResponse, type StewardSurface } from '@lumvika/contracts'

import { api } from '@/api/client'

type Caller = { accessToken: string; workspaceId: number }

const ENGINE = '/api/chat/steward/engine'

export type StewardConversation = NonNullable<ReturnType<typeof stewardEngineConversationSchema.parse>>

export async function fetchStewardState(caller: Caller): Promise<StewardStateResponse> {
    return stewardStateSchema.parse(await api('/api/chat/steward/state', caller))
}

export async function fetchStewardSurface(caller: Caller): Promise<StewardSurface> {
    return (await fetchStewardState(caller)).surface
}

export async function fetchStewardEngineFiles(caller: Caller): Promise<boolean> {
    return stewardEngineFilesSchema.parse(await api('/api/v1/steward/files', caller)).supported
}

export async function fetchStewardConversation(caller: Caller): Promise<StewardConversation | null> {
    return stewardEngineConversationSchema.parse(await api(ENGINE, caller))
}

export async function fetchStewardMessages(caller: Caller, sessionId: string): Promise<ConversationMessage[]> {
    return stewardEngineMessagesSchema.parse(await api(`${ENGINE}?sessionId=${encodeURIComponent(sessionId)}`, caller)).messages
}

// Only the last conversation says which run it has going.
export async function fetchStewardActiveRun(caller: Caller, sessionId: string): Promise<string | null> {
    const conversation = await fetchStewardConversation(caller)
    return conversation?.sessionId === sessionId ? (conversation.activeRunId ?? null) : null
}

export async function stopSteward(caller: Caller, sessionId: string, runId: string | null): Promise<void> {
    const params = new URLSearchParams({ sessionId, ...(runId ? { runId } : {}) })
    await api(`${ENGINE}?${params}`, { ...caller, method: 'DELETE' })
}
