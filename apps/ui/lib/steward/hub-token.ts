import { createHmac, timingSafeEqual } from 'crypto'

// Proves a call to /api/hub comes from the steward: the engine key every coworker of the box holds
// is not enough, since `x-lumvika-agent: steward` opens the account tools. The hub signs one with
// every steward turn's brief, the engine keeps it in memory only, and the secret never leaves the hub.
// Twelve hours outlive the longest run the turn starts.
export const STEWARD_HUB_TOKEN_TTL_MS = 12 * 60 * 60 * 1000

// `uid` is the member the turn speaks for, so the hub acts with their access rather than the
// workspace's. A token minted before it existed carries none and still acts as the workspace.
export type StewardHubClaims = { ws: number; uid?: string; exp: number }

function secret(): string | undefined {
    return process.env.STEWARD_HUB_TOKEN_SECRET || undefined
}

function sign(key: string, payload: string): string {
    return createHmac('sha256', key).update(payload).digest('base64url')
}

export function mintStewardHubToken(workspaceId: number, userId?: string | null, now = Date.now()): string | null {
    const key = secret()
    if (!key) return null
    const claims: StewardHubClaims = { ws: workspaceId, ...(userId ? { uid: userId } : {}), exp: now + STEWARD_HUB_TOKEN_TTL_MS }
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${payload}.${sign(key, payload)}`
}

export function verifyStewardHubToken(raw: string | null | undefined, workspaceId: number, now = Date.now()): StewardHubClaims | null {
    const key = secret()
    if (!key || !raw) return null
    const [payload, signature, ...rest] = raw.split('.')
    if (!payload || !signature || rest.length > 0) return null
    const expected = Buffer.from(sign(key, payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    let claims: Partial<StewardHubClaims>
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<StewardHubClaims>
    } catch {
        return null
    }
    if (claims.ws !== workspaceId || typeof claims.exp !== 'number' || claims.exp <= now) return null
    return { ws: claims.ws, exp: claims.exp, ...(typeof claims.uid === 'string' && claims.uid ? { uid: claims.uid } : {}) }
}

// Required as soon as the hub holds a secret to sign with. Without one (a local hub) a steward call
// carrying no token is let through, and logged. STEWARD_HUB_TOKEN_REQUIRED=0 restores that tolerance
// on a hub that has the secret, for a fleet whose engines do not forward the token yet.
export function stewardHubTokenRequired(): boolean {
    return secret() !== undefined && process.env.STEWARD_HUB_TOKEN_REQUIRED !== '0'
}
