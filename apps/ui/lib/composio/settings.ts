// Where this install's Composio connection comes from. `COMPOSIO_API_KEY` in the environment wins,
// so an install configured by `.env` keeps working as it did; otherwise the key an admin saved from
// the app, in `instance_settings`. Auth configs an admin picked live in `composio_auth_configs` and
// win over the id a service's manifest carries (empty in the catalog a self-hosted install ships).
//
// Server-only: the key can act for every coworker of the install.

import { deleteRows, selectMany, selectMaybeSingle, serviceScope, upsertRows } from '@/lib/db'

const API_KEY_SETTING = 'composio_api_key'
const CACHE_TTL_MS = 30_000

export type ComposioKeySource = 'environment' | 'app' | null

let cachedKey: { value: string | null; readAt: number } | null = null

export function forgetComposioSettingsCache(): void {
    cachedKey = null
}

async function savedApiKey(): Promise<string | null> {
    if (cachedKey && Date.now() - cachedKey.readAt < CACHE_TTL_MS) return cachedKey.value
    const { data, error } = await selectMaybeSingle(serviceScope(), 'instance_settings', ['value'] as const, { key: API_KEY_SETTING })
    if (error) throw new Error(error.message)
    cachedKey = { value: data?.value || null, readAt: Date.now() }
    return cachedKey.value
}

export async function composioApiKey(): Promise<string | null> {
    return process.env.COMPOSIO_API_KEY || (await savedApiKey())
}

export async function composioKeySource(): Promise<ComposioKeySource> {
    if (process.env.COMPOSIO_API_KEY) return 'environment'
    return (await savedApiKey()) ? 'app' : null
}

export async function saveComposioApiKey(apiKey: string, userId: string): Promise<void> {
    const { error } = await upsertRows(serviceScope(), 'instance_settings', { key: API_KEY_SETTING, value: apiKey, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: ['key'] })
    forgetComposioSettingsCache()
    if (error) throw new Error(error.message)
}

export async function removeComposioApiKey(): Promise<void> {
    const { error } = await deleteRows(serviceScope(), 'instance_settings', { key: API_KEY_SETTING })
    forgetComposioSettingsCache()
    if (error) throw new Error(error.message)
}

export async function savedAuthConfigIds(): Promise<Map<string, string>> {
    const { data, error } = await selectMany(serviceScope(), 'composio_auth_configs', ['toolkit', 'auth_config_id'] as const, {})
    if (error) throw new Error(error.message)
    return new Map((data ?? []).map(row => [row.toolkit, row.auth_config_id]))
}

export async function resolveAuthConfigId(composio: { toolkit: string; authConfigId: string }): Promise<string> {
    const { data, error } = await selectMaybeSingle(serviceScope(), 'composio_auth_configs', ['auth_config_id'] as const, { toolkit: composio.toolkit })
    if (error) throw new Error(error.message)
    return data?.auth_config_id || composio.authConfigId
}

export async function saveAuthConfigId(toolkit: string, authConfigId: string, userId: string): Promise<void> {
    const { error } = await upsertRows(serviceScope(), 'composio_auth_configs', { toolkit, auth_config_id: authConfigId, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: ['toolkit'] })
    if (error) throw new Error(error.message)
}

export async function removeAuthConfigId(toolkit: string): Promise<void> {
    const { error } = await deleteRows(serviceScope(), 'composio_auth_configs', { toolkit })
    if (error) throw new Error(error.message)
}
