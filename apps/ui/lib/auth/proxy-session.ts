import { provisionUser } from '@/app/api/_services/user-provisioning.service'
import { getAuth } from '@/lib/auth/auth'
import { userScope } from '@/lib/db'
import { drawPriceArm } from '@lumvika/cloud/billing'
import { routes } from '@/lib/routes'
import { EXPERIMENT_COOKIE } from '@lumvika/analytics/experiments'
import { CONSENT_COOKIE, SESSION_HINT_COOKIE, SESSION_HINT_MAX_AGE, SESSION_HINT_VALUE, parseSessionHintCookie } from '@lumvika/contracts'
import { LOCALE_COOKIE, resolveLocale } from '@lumvika/i18n'
import { NextResponse, type NextRequest } from 'next/server'

// A visitor with no session gets an anonymous user so they can explore the app without
// signing up. We only mint one for real top-level navigations (a document GET outside /auth), never
// for prefetches, RSC fetches, assets or API calls, to avoid spawning throwaway users on every hit.
// A provider sending the browser back to /api/auth/callback is a document GET too, and the session it
// is about to open must not race an anonymous one.
function shouldStartAnonymousSession(request: NextRequest): boolean {
    if (request.method !== 'GET') return false
    if (request.headers.get('sec-fetch-dest') !== 'document') return false
    if (request.nextUrl.pathname.startsWith(routes.auth)) return false
    if (request.nextUrl.pathname.startsWith('/api/')) return false
    return true
}

// A redirect response is built from scratch, so it does not inherit the session cookies written on
// the response being replaced; without them a visitor just given an anonymous session loses it.
function redirectKeepingSession(request: NextRequest, pathname: string, sessionResponse: NextResponse): NextResponse {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const response = NextResponse.redirect(url)
    for (const cookie of sessionResponse.headers.getSetCookie()) response.headers.append('set-cookie', cookie)
    return response
}

function cookieDomain(request: NextRequest): string | undefined {
    const host = (request.headers.get('host') ?? request.nextUrl.hostname).split(':')[0]
    return host.endsWith('lumvika.com') ? '.lumvika.com' : undefined
}

// The reverse proxy (Traefik, under Dokploy) terminates the TLS and forwards the request in clear: without the forwarded header the
// cookie would go out without `Secure` in production.
function isSecure(request: NextRequest): boolean {
    const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    return (forwarded ?? request.nextUrl.protocol.replace(':', '')) === 'https'
}

// The landing reads this one with an inline script before its first paint, so it stays out of
// `httpOnly`. It says nothing a visitor does not already know about themselves. Written on page
// loads only: a cookie set by the middleware on a server action makes Next refresh the router after
// it, and the hint has nothing to learn from an action.
function applySessionHint(request: NextRequest, response: NextResponse, signedIn: boolean): void {
    if (!isPageLoad(request)) return
    if (!signedIn && !parseSessionHintCookie(request.cookies.get(SESSION_HINT_COOKIE)?.value)) return
    response.cookies.set(SESSION_HINT_COOKIE, SESSION_HINT_VALUE, {
        path: '/',
        maxAge: signedIn ? SESSION_HINT_MAX_AGE : 0,
        sameSite: 'lax',
        domain: cookieDomain(request),
        secure: isSecure(request),
        httpOnly: false,
    })
}

// Who the request comes from, as far as the middleware needs to know.
type Identity = { id: string; isAnonymous: boolean }

function isPageLoad(request: NextRequest): boolean {
    return request.headers.get('sec-fetch-dest') === 'document'
}

const PROVISIONED_COOKIE = 'lumvika-provisioned'
const PROVISIONED_MAX_AGE = 30 * 24 * 60 * 60

// `<user id>.<1 once signed_up_at is set, else 0>`, written once provisioning went through. It only
// spares the read: a forged or stale one skips provisioning for its own holder and nobody else.
export function provisioningNeeded(cookie: string | undefined, identity: Identity): boolean {
    const [id, stamped] = (cookie ?? '').split('.')
    if (id !== identity.id) return true
    // An anonymous visitor has nothing left to stamp; the conversion to an account flips the session
    // and brings the provisioning back for the one request that stamps it.
    if (identity.isAnonymous) return false
    return stamped !== '1'
}

function applyProvisionedCookie(request: NextRequest, response: NextResponse, identity: Identity, signedUp: boolean): void {
    response.cookies.set(PROVISIONED_COOKIE, `${identity.id}.${signedUp ? 1 : 0}`, { path: '/', maxAge: PROVISIONED_MAX_AGE, sameSite: 'lax', secure: isSecure(request), httpOnly: true })
}

export async function updateSession(request: NextRequest) {
    const auth = getAuth()
    const response = NextResponse.next({ request })

    // The cookie cache answers without a database read for five minutes; a page load reads the
    // session itself, which is where a revoked one gets caught, and writes the cache again from it:
    // an address claimed or a name changed a moment ago reaches every request after it.
    const read = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: isPageLoad(request) }, returnHeaders: true })
    if (isPageLoad(request)) for (const cookie of read.headers.getSetCookie()) response.headers.append('set-cookie', cookie)
    let session = read.response

    if (!session && shouldStartAnonymousSession(request)) {
        try {
            const { headers: signedIn } = await auth.api.signInAnonymous({ headers: request.headers, returnHeaders: true })
            for (const cookie of signedIn.getSetCookie()) response.headers.append('set-cookie', cookie)
            const cookieHeader = signedIn
                .getSetCookie()
                .map(cookie => cookie.split(';')[0])
                .join('; ')
            session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) })
        } catch (error) {
            console.error('Anonymous sign-in failed', error)
        }
    }

    const identity: Identity | null = session ? { id: session.user.id, isAnonymous: !!(session.user as { isAnonymous?: boolean | null }).isAnonymous } : null

    let provisioned: { signedUp: boolean } | null = null
    if (identity && provisioningNeeded(request.cookies.get(PROVISIONED_COOKIE)?.value, identity)) {
        provisioned = await provisionUser(userScope(identity.id), identity, {
            priceArm: drawPriceArm({
                experimentCookie: request.cookies.get(EXPERIMENT_COOKIE)?.value,
                consentCookie: request.cookies.get(CONSENT_COOKIE)?.value,
                userAgent: request.headers.get('user-agent'),
            }),
            locale: resolveLocale({ cookie: request.cookies.get(LOCALE_COOKIE)?.value, acceptLanguage: request.headers.get('accept-language') }),
        })
    }

    applySessionHint(request, response, !!identity && !identity.isAnonymous)
    if (identity && provisioned) applyProvisionedCookie(request, response, identity, provisioned.signedUp)

    if (identity) {
        // Only real (converted) users are bounced away from /auth. Anonymous users must keep access
        // to /auth so they can sign in or upgrade their account.
        if (!identity.isAnonymous && request.nextUrl.pathname.startsWith(routes.auth) && request.nextUrl.pathname !== routes.authCallback) {
            return redirectKeepingSession(request, routes.home, response)
        }
    } else if (request.nextUrl.pathname === routes.home) {
        // No anonymous session could be minted: send visitors to the auth page.
        return redirectKeepingSession(request, routes.auth, response)
    }

    return response
}
