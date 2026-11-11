import { authClient } from '@/lib/auth/auth-client'
import { OAUTH_PROVIDER_COOKIE, OAUTH_PROVIDER_COOKIE_MAX_AGE_SECONDS, isOAuthProvider, type OAuthProvider } from '@/lib/auth/oauth-providers'
import { routes } from '@/lib/routes'
import { SIGNUP_INTENT_COOKIE } from '@lumvika/analytics'
import { getCookie, setSharedCookie } from '@lumvika/analytics/client'

// Better Auth takes the provider's answer at /api/auth/callback/<provider>, then hands the browser to
// `/auth/callback`, a refusal included, which finishes what is the app's own business.
const RETURN = { callbackURL: routes.authCallback, errorCallbackURL: routes.authCallback }

export async function startOAuthSignIn(provider: OAuthProvider, { linkAnonymous = false }: { linkAnonymous?: boolean } = {}) {
    // Survives the OAuth round-trip; SessionProvider reads it back to emit account_created. Set before
    // the provider says which account it is: `/auth/callback` forgets it when that account was already signed up.
    setSharedCookie(SIGNUP_INTENT_COOKIE, provider, 1)
    document.cookie = `${OAUTH_PROVIDER_COOKIE}=${provider}; path=/; max-age=${OAUTH_PROVIDER_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
    if (linkAnonymous) {
        // Linking keeps the anonymous visitor's id, and with it the workspace they built. An identity
        // that already has an account is only refused on the way back: `/auth/callback` is what signs
        // into that account.
        const { error } = await authClient.linkSocial({ provider, ...RETURN })
        if (!error) return
    }
    await authClient.signIn.social({ provider, ...RETURN })
}

// The provider the last click left for, while its cookie lasts: what a failed return is about.
export function oauthProviderLeftFor(): OAuthProvider | null {
    const value = getCookie(OAUTH_PROVIDER_COOKIE)
    return isOAuthProvider(value) ? value : null
}
