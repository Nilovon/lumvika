import type { Environment } from '@/config/environment'

// A build of the open source app points at the hub it was built for: EXPO_PUBLIC_API_URL, read when
// the bundle is built. The hub is also where the app signs in.
function hubOf(name: Environment['name']): Environment {
    return { name, apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000' }
}

export const PRODUCTION = hubOf('production')
export const STAGING = hubOf('staging')

// No product analytics unless the build names its own PostHog project.
export const POSTHOG_TOKEN = process.env.EXPO_PUBLIC_POSTHOG_TOKEN ?? ''
