import { RERUN_CLOUD } from '@rerun/cloud/edition'

export const OAUTH_PROVIDERS = ['google', 'apple'] as const

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

type OAuthProviderConfig = {
    label: string
    queryParams?: Record<string, string>
    // Google answers 403 disallowed_useragent inside an in-app browser; Apple signs in there fine.
    refusedInAppBrowser: boolean
}

export const OAUTH_PROVIDER_CONFIG: Record<OAuthProvider, OAuthProviderConfig> = {
    google: { label: 'Google', queryParams: { access_type: 'offline', prompt: 'consent' }, refusedInAppBrowser: true },
    apple: { label: 'Apple', refusedInAppBrowser: false },
}

// The providers offered on the sign-in page: NEXT_PUBLIC_OAUTH_PROVIDERS (comma-separated) once
// configured on the Supabase project, else both on Rerun Cloud and none on a self-hosted install.
const CONFIGURED_OAUTH_PROVIDERS = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS

export const ENABLED_OAUTH_PROVIDERS: readonly OAuthProvider[] =
    CONFIGURED_OAUTH_PROVIDERS === undefined ? (RERUN_CLOUD ? OAUTH_PROVIDERS : []) : OAUTH_PROVIDERS.filter(provider => CONFIGURED_OAUTH_PROVIDERS.split(',').map(entry => entry.trim()).includes(provider))

export function isOAuthProvider(value: unknown): value is OAuthProvider {
    return typeof value === 'string' && (OAUTH_PROVIDERS as readonly string[]).includes(value)
}

// Set when leaving for the provider, read by `/auth/callback` when it has to start the sign-in again.
// Not the signup intent: that one waits for analytics consent, and this one is needed without it.
export const OAUTH_PROVIDER_COOKIE = 'rr_oauth_provider'
export const OAUTH_PROVIDER_COOKIE_MAX_AGE_SECONDS = 600
