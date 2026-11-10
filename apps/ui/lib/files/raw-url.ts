import { withTabWorkspace } from '@/lib/workspace/tab-workspace'

export type RawUrlFor = (path: string) => string

/** The proxy that streams a file back from the box (app/api/files/raw). */
export function agentFileRawUrl(agentId: string, path: string): string {
    return withTabWorkspace(`/api/files/raw?agentId=${encodeURIComponent(agentId)}&path=${encodeURIComponent(path)}`)
}

/** The shared folder of the workspace, which no id addresses: the session names the engine. */
export function sharedFileRawUrl(path: string): string {
    return withTabWorkspace(`/api/files/raw?scope=shared&path=${encodeURIComponent(path)}`)
}

/** The steward's own files, which live in a hub bucket rather than on a box. */
export function stewardFileRawUrl(sessionId: string, path: string): string {
    return withTabWorkspace(`/api/steward/files/raw?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`)
}

// `agentId` used to carry two meanings at once in the message components: which Box owns the file,
// and whether the bytes are reachable at all. A read-only transcript has neither, the steward has
// the second without the first. Resolving it once here is what lets those components ask a single
// question: is there a URL for this path, yes or no.
export function rawUrlResolver(agentId?: string, override?: RawUrlFor): RawUrlFor | null {
    if (override) return override
    return agentId ? path => agentFileRawUrl(agentId, path) : null
}
