// Connections whose provider turned the credential away: a refresh token it no longer honours, or a
// run answered with a 401. The token is still on disk, so `connected` alone keeps reading "Ready"
// while every run fails. Kept in memory like plan-limits.ts: after a restart, the next run that
// fails raises it again, so nothing here is worth a file a restored data-dir would have to carry.
const rejected = new Set<string>()

export function recordCredentialRejected(connectionId: string): void {
    rejected.add(connectionId)
}

export function isCredentialRejected(connectionId: string): boolean {
    return rejected.has(connectionId)
}

export function forgetCredentialRejected(connectionId: string): void {
    rejected.delete(connectionId)
}
