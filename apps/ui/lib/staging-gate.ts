// Staging sits behind one shared password, asked by the browser's own Basic Auth prompt. The
// password only exists on the staging host: with no `STAGING_PASSWORD` set, there is no gate.
//
// Only pages are closed. A machine caller (a Stripe webhook, an OAuth callback, an engine) has no
// prompt to answer and its route authenticates itself, and the PostHog relay under /ingest must
// not lose a beacon to a 401.

export const STAGING_GATE_CHALLENGE = 'Basic realm="Lumvika staging", charset="UTF-8"'

const OPEN_PREFIXES = ['/api/', '/ingest/'] as const

export type StagingGateVerdict = 'open' | 'deny'

function basicAuthPassword(authorization: string | null | undefined): string | undefined {
    const match = authorization?.match(/^Basic\s+(\S+)$/i)
    if (!match) return undefined
    try {
        const credentials = new TextDecoder().decode(Uint8Array.from(atob(match[1]), char => char.charCodeAt(0)))
        const separator = credentials.indexOf(':')
        return separator === -1 ? undefined : credentials.slice(separator + 1)
    } catch {
        return undefined
    }
}

export function stagingGateVerdict(input: {
    password: string | undefined
    authorization: string | null | undefined
    pathname: string
}): StagingGateVerdict {
    if (!input.password) return 'open'
    if (OPEN_PREFIXES.some(prefix => input.pathname.startsWith(prefix))) return 'open'
    return basicAuthPassword(input.authorization) === input.password ? 'open' : 'deny'
}
