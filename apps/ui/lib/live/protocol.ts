// What GET /api/live streams, shared by the server and every client (the web app, the mobile app).
//
//   event: change     data: {"table":"agents","op":"UPDATE","row":{...}}
//   event: broadcast  data: {"workspaceId":12,"event":"cursor","payload":{"userId":"...","x":1,"y":2}}
//   event: resync     data:
//
// A change's row is the whole row for INSERT and UPDATE, read as the subscriber under row level
// security; for DELETE it is the key and the workspace and user columns only. `resync` means changes
// may have been missed: read again what is on screen.

export const LIVE_PATH = '/api/live'
export const LIVE_BROADCAST_PATH = '/api/live/broadcast'

export const LIVE_TABLES = ['agents', 'notifications', 'sessions', 'spaces', 'users', 'workspace_members', 'workspaces', 'workspace_getting_started', 'session_reads', 'space_members'] as const

export type LiveTable = (typeof LIVE_TABLES)[number]
export type LiveOp = 'INSERT' | 'UPDATE' | 'DELETE'

export type LiveChange = { table: LiveTable; op: LiveOp; row: Record<string, unknown> }
export type LiveBroadcast = { workspaceId: number; event: string; payload: Record<string, unknown> }

export const BROADCAST_EVENTS = ['cursor', 'cursor-leave'] as const
export type BroadcastEvent = (typeof BROADCAST_EVENTS)[number]

export function isLiveTable(value: unknown): value is LiveTable {
    return typeof value === 'string' && (LIVE_TABLES as readonly string[]).includes(value)
}
