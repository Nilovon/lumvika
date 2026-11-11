import { z } from 'zod'

import { BROADCAST_EVENTS, LIVE_TABLES } from '@/lib/live/protocol'

const scalar = z.union([z.string(), z.number()])

const rowNotification = z.object({
    kind: z.literal('row'),
    table: z.enum(LIVE_TABLES),
    op: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    workspace_id: z.number().int().nullable(),
    user_id: z.string().nullable(),
    key: z.record(z.string(), scalar),
    old: z.record(z.string(), scalar.nullable()).optional(),
})

const broadcastNotification = z.object({
    kind: z.literal('broadcast'),
    workspace_id: z.number().int(),
    from: z.string(),
    event: z.enum(BROADCAST_EVENTS),
    payload: z.record(z.string(), z.unknown()),
})

const liveNotification = z.discriminatedUnion('kind', [rowNotification, broadcastNotification])

export type RowNotification = z.infer<typeof rowNotification>
export type BroadcastNotification = z.infer<typeof broadcastNotification>
export type LiveNotification = z.infer<typeof liveNotification>

// The notification a payload of `lumvika_live` carries, or null for one this version does not read.
export function parseLiveNotification(payload: string): LiveNotification | null {
    let json: unknown
    try {
        json = JSON.parse(payload)
    } catch {
        return null
    }
    const parsed = liveNotification.safeParse(json)
    return parsed.success ? parsed.data : null
}
