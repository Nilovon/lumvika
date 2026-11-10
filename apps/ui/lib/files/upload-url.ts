import { withTabWorkspace } from '@/lib/workspace/tab-workspace'

// Where a picked file is sent. The Boxes stream through the engine proxy; the steward of the
// onboarding has no Box behind it, so its bytes land in a private bucket on the hub instead. The
// steward on the engine is addressed as the agent it is there.
export type UploadTarget = { kind: 'agent'; agentId: string } | { kind: 'shared' } | { kind: 'steward'; sessionId: string }

// Shared by the attachment uploader and the voice recorder, which used to each spell the query out.
export function uploadUrl(target: UploadTarget, dir: string, name: string, size: number): string {
    const query = new URLSearchParams({ name, size: String(size) })
    if (dir) query.set('dir', dir)
    if (target.kind === 'steward') {
        query.set('sessionId', target.sessionId)
        return withTabWorkspace(`/api/steward/files/stream?${query}`)
    }
    if (target.kind === 'agent') query.set('agentId', target.agentId)
    else query.set('scope', 'shared')
    return withTabWorkspace(`/api/files/stream?${query}`)
}
