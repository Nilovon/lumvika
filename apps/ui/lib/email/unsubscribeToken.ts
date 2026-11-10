import { createHmac, timingSafeEqual } from 'node:crypto'

// No 'server-only': this module is imported both from email.service.ts (Next server) and from the
// Trigger.dev trial lifecycle tasks, which are bundled outside the Next.js RSC pipeline.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.rerun.build'

function getSecret(): string {
    const secret = process.env.UNSUBSCRIBE_SECRET
    if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not set')
    return secret
}

function sign(payload: string): string {
    return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

// What the recipient is asking to stop. Absent means the account categories, which is what every
// link meant before run notifications carried their own scope, so old tokens keep their behaviour.
export const UNSUBSCRIBE_SCOPES = ['runs'] as const

export type UnsubscribeScope = (typeof UNSUBSCRIBE_SCOPES)[number]

export type UnsubscribeTarget = { userId: string; scope: UnsubscribeScope | null }

// A uuid cannot contain it, so a payload that holds one is a scoped token and one that does not is
// a legacy token carrying the bare user id.
const SCOPE_SEPARATOR = '\n'

function isScope(value: string | undefined): value is UnsubscribeScope {
    return value !== undefined && (UNSUBSCRIBE_SCOPES as readonly string[]).includes(value)
}

// Signed, non-expiring token identifying a user (and what they want stopped) for one-click
// unsubscribe. An unsubscribe link must keep working indefinitely, so there is deliberately no expiry.
export function createUnsubscribeToken(userId: string, scope?: UnsubscribeScope): string {
    const payload = Buffer.from(scope ? `${userId}${SCOPE_SEPARATOR}${scope}` : userId, 'utf8').toString('base64url')
    return `${payload}.${sign(payload)}`
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTarget | null {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [payload, signature] = parts

    const expected = sign(payload)
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    const [userId, rawScope] = Buffer.from(payload, 'base64url').toString('utf8').split(SCOPE_SEPARATOR)
    if (!userId) return null
    return { userId, scope: isScope(rawScope) ? rawScope : null }
}

export function buildUnsubscribeUrl(userId: string, appUrl: string = APP_URL, scope?: UnsubscribeScope): string {
    return `${appUrl}/unsubscribe?token=${createUnsubscribeToken(userId, scope)}`
}

// RFC 8058 one-click unsubscribe headers, derived from the human-facing unsubscribe page URL. The
// same signed token drives the POST endpoint at /api/unsubscribe.
export function listUnsubscribeHeaders(unsubscribeUrl?: string): Record<string, string> {
    if (!unsubscribeUrl || !unsubscribeUrl.includes('/unsubscribe?')) return {}
    const oneClickUrl = unsubscribeUrl.replace('/unsubscribe?', '/api/unsubscribe?')
    return {
        'List-Unsubscribe': `<${oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
}
