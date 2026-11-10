import { stewardIndustryResultSchema, stewardLeadResultSchema, stewardTrialResultSchema, type StewardIntakeRequest, type TemplateCategory } from '@lumvika/contracts'
import type { UIMessage } from 'ai'

import { api } from '@/api/client'

type Caller = { accessToken: string; workspaceId: number }

const BASE = '/api/v1/steward'

export async function saveIntake(caller: Caller, intake: StewardIntakeRequest): Promise<void> {
    await api(`${BASE}/intake`, { ...caller, method: 'POST', body: intake })
}

export async function decideIndustry(caller: Caller, input: string): Promise<TemplateCategory | null> {
    return stewardIndustryResultSchema.parse(await api(`${BASE}/industry`, { ...caller, method: 'POST', body: { input } })).industry
}

// Whether the workspace is on once the app has asked: false for a trial already spent.
export async function startTeam(caller: Caller): Promise<boolean> {
    return stewardTrialResultSchema.parse(await api(`${BASE}/trial`, { ...caller, method: 'POST' })).entitled
}

export async function startLead(caller: Caller, agentId: string): Promise<{ conversationId: string; runId: string | null }> {
    return stewardLeadResultSchema.parse(await api(`${BASE}/lead`, { ...caller, method: 'POST', body: { agentId } }))
}

export type OnboardingConversation = { sessionId: string; messages: UIMessage[] }

// The hub's onboarding conversation, null before the first one. Its transcript is the AI SDK's own
// messages, cards included, so it is handed back as is.
export async function fetchOnboardingConversation(caller: Caller): Promise<OnboardingConversation | null> {
    const conversation = await api<{ sessionId?: string; backend?: string; messages?: UIMessage[] } | null>('/api/chat/steward', caller)
    if (!conversation?.sessionId || conversation.backend === 'engine') return null
    return { sessionId: conversation.sessionId, messages: conversation.messages ?? [] }
}
