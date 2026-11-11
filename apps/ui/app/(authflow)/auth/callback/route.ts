import { getAuth } from '@/lib/auth/auth'
import { LAST_SIGN_IN_COOKIE, LAST_SIGN_IN_MAX_AGE_SECONDS } from '@/lib/auth/last-sign-in-cookie'
import { ACCOUNT_LINK_ERROR_PARAM, ACCOUNT_LINK_PROVIDER_PARAM, ACCOUNT_PARAM, IDENTITY_TAKEN, LINK_INTENT_COOKIE } from '@/lib/auth/link-intent'
import { OAUTH_PROVIDER_COOKIE, isOAuthProvider, type OAuthProvider } from '@/lib/auth/oauth-providers'
import { internalPath } from '@/lib/auth/internal-path'
import { OAUTH_STATE_EXPIRED } from '@/lib/auth/oauth-error'
import { PENDING_INVITE_COOKIE } from '@/lib/auth/pending-invite'
import { claimProviderEmail } from '@/lib/auth/provider-email'
import { selectMaybeSingle, userScope } from '@/lib/db'
import { routes } from '@/lib/routes'
import { SIGNUP_INTENT_COOKIE, sharedCookieDomain } from '@lumvika/analytics'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Better Auth answers the provider at /api/auth/callback/<provider>, opens the session there, and
// hands the browser on to this route, with `?error=` when it refused. What is left is the app's own
// business: the address a linked visitor claims, the invitation waiting, the badges and analytics.

// Behind the proxy the request's own origin is the internal one.
function publicUrl(request: Request, destination: string): string {
    const { origin } = new URL(request.url)
    const forwardedHost = request.headers.get('x-forwarded-host')
    if (process.env.NODE_ENV === 'development' || !forwardedHost) return `${origin}${destination}`
    return `https://${forwardedHost}${destination}`
}

// Every provider click leaves the intent behind, and the app reads it back as the birth of an account
// once `signed_up_at` shows up. An account that was already signed up before this sign-in, the one a
// visitor returning through « Log in » is sent back to, was not born here: forgetting the intent is
// what keeps it from being counted as a second signup.
//
// The presence of the stamp alone cannot tell: the middleware runs on this very request, ahead of
// the handler, and stamps an account born from this sign-in. A stamp that is only seconds old is this
// sign-in's own, one older than any request could be belongs to an account that existed before.
const SIGNUP_STAMP_WINDOW_MS = 2 * 60 * 1000

async function wasSignedUpBeforeThisSignIn(userId: string): Promise<boolean> {
    const { data } = await selectMaybeSingle(userScope(userId), 'users', ['signed_up_at'] as const, { id: userId })
    if (!data?.signed_up_at) return false
    return Date.now() - Date.parse(data.signed_up_at) > SIGNUP_STAMP_WINDOW_MS
}

function forgetSignupIntent(request: Request, response: NextResponse) {
    const domain = sharedCookieDomain(new URL(publicUrl(request, '/')).hostname)
    response.cookies.set(SIGNUP_INTENT_COOKIE, '', { path: '/', maxAge: 0, ...(domain && { domain }) })
}

// A cookie from another tab or an older version may hold anything: Google was the only provider then.
function providerIn(value: string | undefined): OAuthProvider {
    return isOAuthProvider(value) ? value : 'google'
}

// Connecting a provider from the account settings ends here too, already signed in: it goes back to
// the settings it left, with the reason when the provider or the auth layer refused.
function backToAccount(request: Request, linkError?: { code: string; provider: OAuthProvider }): NextResponse {
    const params = new URLSearchParams({
        [ACCOUNT_PARAM]: 'sign-in',
        ...(linkError ? { [ACCOUNT_LINK_ERROR_PARAM]: linkError.code, [ACCOUNT_LINK_PROVIDER_PARAM]: linkError.provider } : {}),
    })
    const response = NextResponse.redirect(publicUrl(request, `${routes.home}?${params}`))
    response.cookies.delete(LINK_INTENT_COOKIE)
    return response
}

const failed = (request: Request) => NextResponse.redirect(publicUrl(request, routes.authCodeError))

// The round trip outlived its state (a second tab, a back button, a sign-in left open): nothing to fix
// but to pick the account again.
const EXPIRED_STATE = new Set(['state_mismatch', 'state_not_found', 'state_invalid', 'state_security_mismatch', 'please_restart_the_process'])

// A sign-in the provider or the round trip turned down goes back to the board, which reopens the
// account dialog on the reason (`oauthErrorCode`).
function retryFromHome(request: Request, error: string): NextResponse {
    const code = EXPIRED_STATE.has(error) ? OAUTH_STATE_EXPIRED : error
    return NextResponse.redirect(publicUrl(request, `${routes.home}?${new URLSearchParams({ error: code, error_code: code })}`))
}

// The identity the visitor tried to link has its own Lumvika account: sign into that one instead.
// The state cookie Better Auth sets for the round trip rides on the redirect.
async function signInInstead(request: Request, provider: OAuthProvider): Promise<NextResponse> {
    try {
        const { headers, response } = await getAuth().api.signInSocial({
            headers: request.headers,
            body: { provider, callbackURL: routes.authCallback, errorCallbackURL: routes.authCallback, disableRedirect: true },
            returnHeaders: true,
        })
        if (!response.url) return failed(request)
        const redirect = NextResponse.redirect(response.url)
        for (const cookie of headers.getSetCookie()) redirect.headers.append('set-cookie', cookie)
        return redirect
    } catch (error) {
        console.error('[auth/callback] could not restart the sign-in', error instanceof Error ? error.message : error)
        return failed(request)
    }
}

export async function GET(request: Request) {
    const error = new URL(request.url).searchParams.get('error')
    const cookieStore = await cookies()
    const linkIntent = cookieStore.get(LINK_INTENT_COOKIE)?.value
    const linking = linkIntent !== undefined
    const providerLeftFor = providerIn(cookieStore.get(OAUTH_PROVIDER_COOKIE)?.value)

    if (error) {
        if (linking) return backToAccount(request, { code: error, provider: providerIn(linkIntent) })
        if (error === IDENTITY_TAKEN) return signInInstead(request, providerLeftFor)
        return retryFromHome(request, error)
    }

    const session = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } })
    if (!session) return linking ? backToAccount(request, { code: 'failed', provider: providerIn(linkIntent) }) : failed(request)
    if (linking) return backToAccount(request)

    let refreshedSession: string[] = []
    if ((session.user as { isAnonymous?: boolean | null }).isAnonymous) {
        const claim = await claimProviderEmail(session.user.id)
        if (claim === 'taken') return signInInstead(request, providerLeftFor)
        if (claim === 'failed') return failed(request)
        // The session's signed copy still says anonymous: it is written again from the claimed row.
        const { headers } = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true }, returnHeaders: true })
        refreshedSession = headers.getSetCookie()
    }

    const pendingInvite = cookieStore.get(PENDING_INVITE_COOKIE)?.value
    const response = NextResponse.redirect(publicUrl(request, internalPath(pendingInvite, routes.home)))
    for (const cookie of refreshedSession) response.headers.append('set-cookie', cookie)
    if (pendingInvite) response.cookies.delete(PENDING_INVITE_COOKIE)

    // Only a provider the click left behind is worth remembering: the guess that restarts a sign-in
    // would badge the wrong button for a year.
    const provider = cookieStore.get(OAUTH_PROVIDER_COOKIE)?.value
    if (isOAuthProvider(provider)) response.cookies.set(LAST_SIGN_IN_COOKIE, provider, { path: '/', maxAge: LAST_SIGN_IN_MAX_AGE_SECONDS, sameSite: 'lax' })

    if (await wasSignedUpBeforeThisSignIn(session.user.id)) forgetSignupIntent(request, response)

    return response
}
