// What `/auth/callback` appends to `/` when a Google or Apple sign-in failed on the way back.
// `bad_oauth_state` is the usual one: the flow outlived its state (a second tab, a back button, a
// sign-in left open). Read from the fragment as well, for a link written that way.
export const OAUTH_STATE_EXPIRED = 'bad_oauth_state'

const OAUTH_ERROR_PARAMS = ['error', 'error_code', 'error_description'] as const

function fragmentParams(url: URL): URLSearchParams {
    return new URLSearchParams(url.hash.replace(/^#/, ''))
}

function carriesOAuthError(params: URLSearchParams): boolean {
    return params.has('error_code') || params.has('error_description')
}

// The error code of a failed sign-in the URL came back with, or null when it carries none. A bare
// `error` is not enough: other flows landing on `/` may use that name for something else.
export function oauthErrorCode(url: URL): string | null {
    for (const params of [url.searchParams, fragmentParams(url)]) {
        if (carriesOAuthError(params)) return params.get('error_code') ?? params.get('error') ?? 'unknown'
    }
    return null
}

export function withoutOAuthError(url: URL): URL {
    const clean = new URL(url)
    if (carriesOAuthError(clean.searchParams)) for (const key of OAUTH_ERROR_PARAMS) clean.searchParams.delete(key)
    if (carriesOAuthError(fragmentParams(clean))) clean.hash = ''
    return clean
}

export type OAuthRetryCopy = { title: string; subtitle: string }

export type OAuthRetryTranslator = (key: 'expiredTitle' | 'expiredWithProvider' | 'expired' | 'cancelledTitle' | 'cancelled' | 'failedTitle' | 'failed', values?: { provider: string }) => string

// What the account dialog says when it reopens on a failed return. The auth layer keeps the state of
// the round trip for a few minutes: past that, the provider sends the visitor back with an expired
// state, nothing to fix but to pick the account again.
export function oauthRetryCopy(code: string, providerLabel: string | null, t: OAuthRetryTranslator): OAuthRetryCopy {
    if (code === OAUTH_STATE_EXPIRED) {
        return { title: t('expiredTitle'), subtitle: providerLabel ? t('expiredWithProvider', { provider: providerLabel }) : t('expired') }
    }
    if (code === 'access_denied') return { title: t('cancelledTitle'), subtitle: t('cancelled') }
    return { title: t('failedTitle'), subtitle: t('failed') }
}
