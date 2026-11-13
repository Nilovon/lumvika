import { z } from 'zod'

export const sessionSourceSchema = z.enum(['dashboard', 'builder', 'schedule', 'agent', 'delegate', 'api', 'trigger', 'issue', 'channel'])
export type SessionSource = z.infer<typeof sessionSourceSchema>

// The sources every app ever shipped knows, frozen: a build older than a source parses `source`
// with this list alone and fails the whole response on anything else. The hub sends a later source
// to those builds as `agent`, a run nobody typed, and a source added tomorrow is mapped the same way
// without anyone having to remember it.
export const SESSION_SOURCES_KNOWN_TO_EVERY_CLIENT = Object.freeze(['dashboard', 'builder', 'schedule', 'agent', 'delegate', 'api', 'trigger'] as const satisfies readonly SessionSource[])
export type LegacySessionSource = (typeof SESSION_SOURCES_KNOWN_TO_EVERY_CLIENT)[number]

const knownToEveryClient: ReadonlySet<string> = new Set(SESSION_SOURCES_KNOWN_TO_EVERY_CLIENT)

export function sessionSourceForClient(source: string | null | undefined): LegacySessionSource {
    if (!source) return 'dashboard'
    return knownToEveryClient.has(source) ? (source as LegacySessionSource) : 'agent'
}

// What a client reads a source with: a value it does not know falls back to `agent` instead of
// failing the response it came in.
export const clientSessionSourceSchema = sessionSourceSchema.catch('agent')

export const sessionSchema = z.object({
    id: z.string(),
    agentId: z.string(),
    title: z.string(),
    status: z.string(),
    source: sessionSourceSchema.default('dashboard'),
    originAgentId: z.string().nullable().default(null),
    originSessionId: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Session = z.infer<typeof sessionSchema>

export const sessionsListSchema = z.object({ sessions: z.array(sessionSchema) })

export const messageRoleSchema = z.enum(['user', 'assistant', 'tool'])
export type MessageRole = z.infer<typeof messageRoleSchema>

export const messageSchema = z.object({
    id: z.string(),
    sessionId: z.string(),
    role: messageRoleSchema,
    contentJson: z.string(),
    toolCallsJson: z.string().nullable(),
    // Absent on an engine older than message attribution, null when nobody typed the message.
    authorId: z.string().nullish(),
    createdAt: z.string(),
})
export type Message = z.infer<typeof messageSchema>

export const messagesListSchema = z.object({ messages: z.array(messageSchema) })
