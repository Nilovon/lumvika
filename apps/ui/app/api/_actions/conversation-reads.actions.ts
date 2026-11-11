'use server'

import { z } from 'zod'

import { getRequestScope } from '@/lib/auth/session/request'
import { selectMaybeSingle } from '@/lib/db'

// The conversation a notification points at, read as the caller under row level security.

const conversationSchema = z.object({ agentId: z.guid(), engineSessionId: z.string().min(1).max(200) })

// The session row behind an engine session of this coworker, null when the caller cannot read it.
export async function findSessionIdByEngineSessionAction(agentId: string, engineSessionId: string): Promise<string | null> {
    const parsed = conversationSchema.safeParse({ agentId, engineSessionId })
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'sessions', ['id'] as const, { agent_id: parsed.data.agentId, engine_session_id: parsed.data.engineSessionId })
    return data?.id ?? null
}
