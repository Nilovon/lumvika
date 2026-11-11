import * as Updates from 'expo-updates'

import { readCustomServer, type CustomServer } from '@/config/custom-server'
import { PRODUCTION, STAGING } from '@lumvika/cloud-mobile/environments'

export type Environment = {
    name: 'production' | 'staging' | 'local' | 'custom'
    apiUrl: string
}

// A store build is bound to its environment by the update channel baked in at build time, never by
// EXPO_PUBLIC_* values: those are inlined by whoever runs `eas update`, so an update published from a
// laptop on the production profile would otherwise point a staging build at production.
export function environmentForChannel(channel: string | null): Environment {
    if (channel === 'production') return PRODUCTION
    if (channel === 'staging') return STAGING

    return {
        name: 'local',
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? STAGING.apiUrl,
    }
}

// A server the person picked in the app, their own Lumvika, comes before the one the build was made for.
export function environmentAtLaunch(channel: string | null, custom: CustomServer | null): Environment {
    if (custom) return { name: 'custom', ...custom }
    return environmentForChannel(channel)
}

export const environment = environmentAtLaunch(Updates.channel, readCustomServer())

export const onCustomServer = environment.name === 'custom'

// Where a person is sent to do what the app does not: lumvika.com, or their own server.
export const webHost = onCustomServer ? new URL(environment.apiUrl).host : 'lumvika.com'
