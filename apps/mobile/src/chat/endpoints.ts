import { STEWARD_AGENT_ID } from '@lumvika/contracts'
import type { UIMessage } from 'ai'
import { randomUUID } from 'expo-crypto'

import { fetchActiveRun, fetchMessages, stopConversation } from '@/api/chat'
import type { FileOwner } from '@/api/files'
import { fetchStewardActiveRun, fetchStewardMessages, stopSteward } from '@/api/steward'

type Caller = { accessToken: string; workspaceId: number }

// Where one conversation is sent, read back and stopped. A coworker talks through /api/chat and the
// hub names a new conversation in a header; the Steward has its own route and is handed the id of
// the conversation by the app.
export type ChatEndpoints = {
    agentId: string
    sendPath: string
    sendBody: (sessionId: string | null, text: string) => Record<string, unknown>
    bornSessionOf: (response: Response) => string | null
    messages: (caller: Caller, sessionId: string) => Promise<UIMessage[]>
    activeRun: (caller: Caller, sessionId: string) => Promise<string | null>
    stop: (caller: Caller, sessionId: string, runId: string | null) => Promise<void>
    // Where the conversation's uploads go, before its first send included.
    fileOwner: (sessionId: string | null) => FileOwner
}

export function coworkerEndpoints(agentId: string): ChatEndpoints {
    return {
        agentId,
        sendPath: '/api/chat',
        sendBody: (sessionId, text) => ({ agentId, sessionId: sessionId ?? undefined, text }),
        bornSessionOf: response => response.headers.get('X-Session-Id'),
        messages: async (caller, sessionId) => (await fetchMessages(caller, sessionId)) as UIMessage[],
        activeRun: fetchActiveRun,
        stop: (caller, sessionId) => stopConversation(caller, sessionId),
        fileOwner: () => ({ kind: 'agent', agentId }),
    }
}

// Its files live in its own workspace on the machine once the machine takes them, in the hub's
// bucket before: the web column switches the same way.
export function stewardEndpoints(filesOnEngine: () => boolean): ChatEndpoints {
    const draftId = randomUUID()
    return {
        agentId: STEWARD_AGENT_ID,
        sendPath: '/api/chat/steward/engine',
        sendBody: (sessionId, text) => ({ sessionId: sessionId ?? draftId, text }),
        bornSessionOf: response => (response.ok ? draftId : null),
        messages: async (caller, sessionId) => (await fetchStewardMessages(caller, sessionId)) as UIMessage[],
        activeRun: fetchStewardActiveRun,
        stop: stopSteward,
        fileOwner: sessionId => (filesOnEngine() ? { kind: 'agent', agentId: STEWARD_AGENT_ID } : { kind: 'steward', sessionId: sessionId ?? draftId }),
    }
}
