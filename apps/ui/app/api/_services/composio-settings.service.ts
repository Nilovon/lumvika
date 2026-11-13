import { ComposioApiError, type ComposioAuthConfig, createManagedAuthConfig, listAuthConfigs } from '@/lib/composio/client'
import { type ComposioKeySource, composioApiKey, composioKeySource, removeAuthConfigId, removeComposioApiKey, saveAuthConfigId, saveComposioApiKey, savedAuthConfigIds } from '@/lib/composio/settings'
import { selectMany, serviceScope } from '@/lib/db'
import { AppError, type ErrorCode } from '@/lib/i18n/action-error'
import { serviceManifestSchema } from '@/lib/services/manifest'

const AUTH_CONFIG_ID_PATTERN = /^ac_[A-Za-z0-9_-]{1,190}$/
const KEY_HINT_LENGTH = 4

export type ComposioService = {
    slug: string
    name: string
    icon: string | null
    category: string
    enabled: boolean
    toolkit: string
    authConfigId: string | null
    // `app` when an admin set it from the Composio panel, `catalog` when it comes with the service.
    authConfigSource: 'app' | 'catalog' | null
}

export type ComposioOverview = {
    keySource: ComposioKeySource
    keyHint: string | null
    namespace: string
    services: ComposioService[]
    // The auth configs of the Composio project, or the reason they could not be read.
    authConfigs: ComposioAuthConfig[]
    authConfigsError: ErrorCode | null
}

// Whatever goes wrong talking to Composio (a refusal, a timeout, a page that is not JSON) becomes a
// reason the admin can read, so the panel always stays usable to fix the key.
export function composioFailure(err: unknown): AppError {
    if (err instanceof AppError) return err
    if (err instanceof ComposioApiError) {
        if (err.status === 401 || err.status === 403) return new AppError('composioKeyRejected')
        if (err.reason && err.status >= 400 && err.status < 500) return new AppError('composioRejected', { message: err.reason })
    }
    if (!(err instanceof ComposioApiError)) console.warn('[composio] call failed:', err instanceof Error ? err.message : err)
    return new AppError('composioUnreachable')
}

async function composioServices(): Promise<ComposioService[]> {
    const [{ data, error }, saved] = await Promise.all([selectMany(serviceScope(), 'services', ['slug', 'name', 'icon', 'category', 'enabled', 'manifest'] as const, {}), savedAuthConfigIds()])
    if (error) throw new Error(error.message)
    const services: ComposioService[] = []
    for (const row of data ?? []) {
        const manifest = serviceManifestSchema.safeParse(row.manifest)
        if (!manifest.success) continue
        const composio = manifest.data.authMethods.find(method => method.kind === 'composio' && method.composio)?.composio
        if (!composio) continue
        const savedId = saved.get(composio.toolkit)
        services.push({
            slug: row.slug,
            name: row.name,
            icon: row.icon,
            category: row.category,
            enabled: row.enabled,
            toolkit: composio.toolkit,
            authConfigId: savedId || composio.authConfigId || null,
            authConfigSource: savedId ? 'app' : composio.authConfigId ? 'catalog' : null,
        })
    }
    return services.sort((a, b) => a.name.localeCompare(b.name))
}

function keyHint(key: string | null): string | null {
    if (!key) return null
    return key.length > KEY_HINT_LENGTH * 2 ? key.slice(-KEY_HINT_LENGTH) : null
}

export async function readComposioOverview(): Promise<ComposioOverview> {
    const [keySource, key, services] = await Promise.all([composioKeySource(), composioApiKey(), composioServices()])
    let authConfigs: ComposioAuthConfig[] = []
    let authConfigsError: ErrorCode | null = null
    if (key) {
        try {
            authConfigs = await listAuthConfigs()
        } catch (err) {
            authConfigsError = composioFailure(err).code
        }
    }
    return { keySource, keyHint: keyHint(key), namespace: process.env.COMPOSIO_USER_NAMESPACE || 'local', services, authConfigs, authConfigsError }
}

export async function connectComposio(apiKey: string, userId: string): Promise<void> {
    const key = apiKey.trim()
    if (!key) throw new AppError('composioKeyEmpty')
    if (process.env.COMPOSIO_API_KEY) throw new AppError('composioKeyInEnvironment')
    try {
        await listAuthConfigs(key)
    } catch (err) {
        throw composioFailure(err)
    }
    await saveComposioApiKey(key, userId)
}

export async function disconnectComposio(): Promise<void> {
    if (process.env.COMPOSIO_API_KEY) throw new AppError('composioKeyInEnvironment')
    await removeComposioApiKey()
}

async function assertCatalogToolkit(toolkit: string): Promise<void> {
    const services = await composioServices()
    if (!services.some(service => service.toolkit === toolkit)) throw new AppError('composioUnknownToolkit')
}

export async function setToolkitAuthConfig(toolkit: string, authConfigId: string, userId: string): Promise<void> {
    const id = authConfigId.trim()
    if (!AUTH_CONFIG_ID_PATTERN.test(id)) throw new AppError('composioInvalidAuthConfig')
    await assertCatalogToolkit(toolkit)
    await saveAuthConfigId(toolkit, id, userId)
}

export async function clearToolkitAuthConfig(toolkit: string): Promise<void> {
    await removeAuthConfigId(toolkit)
}

export async function createToolkitAuthConfig(toolkit: string, userId: string): Promise<string> {
    await assertCatalogToolkit(toolkit)
    if (!(await composioApiKey())) throw new AppError('composioNotConfigured')
    let id: string
    try {
        id = await createManagedAuthConfig(toolkit)
    } catch (err) {
        throw composioFailure(err)
    }
    await saveAuthConfigId(toolkit, id, userId)
    return id
}
