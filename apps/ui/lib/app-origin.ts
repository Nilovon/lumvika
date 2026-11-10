import { headers } from 'next/headers'
import { site } from '@/lib/site'

const CONFIGURED_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? site.url).replace(/\/$/, '')

// Where a Stripe redirect (checkout, portal, Connect onboarding) has to land the user back.
// In dev the port is whatever the workspace was handed - Conductor gives each one its own
// $CONDUCTOR_PORT - so a fixed NEXT_PUBLIC_APP_URL sends the user to another workspace's app, or to
// nothing at all. The host the request came in on is the only origin that is actually running.
export async function getAppOrigin(): Promise<string> {
    if (process.env.NODE_ENV !== 'development') return CONFIGURED_ORIGIN

    const host = (await headers()).get('host')
    return host ? `http://${host}` : CONFIGURED_ORIGIN
}
