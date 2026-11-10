import { OAUTH_PROVIDER_CONFIG, OAUTH_PROVIDER_COOKIE, OAUTH_PROVIDER_COOKIE_MAX_AGE_SECONDS, isOAuthProvider, type OAuthProvider } from '@/lib/auth/oauth-providers'
import { createClient } from '@/supabase/client'
import { SIGNUP_INTENT_COOKIE } from '@lumvika/analytics'
import { getCookie, setSharedCookie } from '@lumvika/analytics/client'

export async function startOAuthSignIn(provider: OAuthProvider, { linkAnonymous = false }: { linkAnonymous?: boolean } = {}) {
    // Survives the OAuth round-trip; SessionProvider reads it back to emit account_created. Set before
    // the provider says which account it is: `/auth/callback` forgets it when that account was already signed up.
    setSharedCookie(SIGNUP_INTENT_COOKIE, provider, 1)
    document.cookie = `${OAUTH_PROVIDER_COOKIE}=${provider}; path=/; max-age=${OAUTH_PROVIDER_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
    const supabase = createClient()
    const options = { redirectTo: `${window.location.origin}/auth/callback`, queryParams: OAUTH_PROVIDER_CONFIG[provider].queryParams }
    if (linkAnonymous) {
        // Manual identity linking upgrades the anonymous user with their provider identity. If linking
        // is unavailable, fall back to a plain OAuth sign-in. An identity that is already taken is only
        // refused on the way back: `/auth/callback` is what signs into its account.
        const { error } = await supabase.auth.linkIdentity({ provider, options })
        if (!error) return
    }
    await supabase.auth.signInWithOAuth({ provider, options })
}

// The provider the last click left for, while its cookie lasts: what a failed return is about.
export function oauthProviderLeftFor(): OAuthProvider | null {
    const value = getCookie(OAUTH_PROVIDER_COOKIE)
    return isOAuthProvider(value) ? value : null
}
