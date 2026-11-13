// Minimal Composio API client (v3.1). Composio brokers the third-party OAuth and holds the
// tokens; Lumvika executes tools scoped by user_id. The org-wide COMPOSIO_API_KEY can act for
// ANY user_id, so this module is server-only and the key never reaches an engine or a manifest.
//
// user_id convention: `<namespace>_agent_<agents.id>` (the database UUID — stable across box
// migrations, unlike engine agent ids which are only unique per engine). Derived server-side
// on every path, never accepted from a caller. The namespace matters because staging runs on
// a clone of the prod database: the same agent id exists in both, and without the prefix a
// staging agent would be handed a real customer's connection. Defaults to 'local' rather than
// 'prod' so forgetting it can only isolate, never collide.
// An extra account of an app (registry key `<slug>@<instanceId>`) gets its own user_id, suffixed
// with the instance id, so Composio holds one connected account per instance.

import { composioApiKey } from '@/lib/composio/settings'

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1'

const TOOLS_CACHE_TTL_MS = 10 * 60 * 1000

export class ComposioApiError extends Error {
    status: number
    // Composio's own explanation (`error.message` of its answer), when it gave one.
    reason: string | null

    constructor(status: number, message: string, reason: string | null = null) {
        super(message)
        this.status = status
        this.reason = reason
    }
}

function reasonOf(detail: string): string | null {
    try {
        const parsed = JSON.parse(detail) as { error?: { message?: unknown } }
        return typeof parsed.error?.message === 'string' ? parsed.error.message.slice(0, 300) : null
    } catch {
        return null
    }
}

export function composioUserId(agentId: string, instanceId?: string): string {
    const base = `${process.env.COMPOSIO_USER_NAMESPACE || 'local'}_agent_${agentId}`
    return instanceId ? `${base}_${instanceId}` : base
}

export async function composioConfigured(): Promise<boolean> {
    return Boolean(await composioApiKey())
}

// `apiKey` checks a key an admin is about to save; every other call uses the install's own.
async function composioFetch<T>(path: string, init?: RequestInit, apiKey?: string): Promise<T> {
    const key = apiKey ?? (await composioApiKey())
    if (!key) throw new ComposioApiError(500, 'Composio is not configured on this server.')
    const res = await fetch(`${COMPOSIO_API_BASE}${path}`, {
        ...init,
        headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new ComposioApiError(res.status, `Composio ${init?.method ?? 'GET'} ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`, reasonOf(detail))
    }
    return (await res.json()) as T
}

export type ComposioConnectRequest = { connectedAccountId: string; redirectUrl: string }

export async function initiateConnectedAccount(userId: string, authConfigId: string, callbackUrl: string): Promise<ComposioConnectRequest> {
    const data = await composioFetch<{ connected_account_id?: string; redirect_url?: string }>('/connected_accounts/link', {
        method: 'POST',
        body: JSON.stringify({ auth_config_id: authConfigId, user_id: userId, callback_url: callbackUrl }),
    })
    if (!data.connected_account_id || !data.redirect_url) throw new ComposioApiError(502, 'Composio link response is missing the redirect URL')
    return { connectedAccountId: data.connected_account_id, redirectUrl: data.redirect_url }
}

export type ComposioConnectedAccount = {
    id: string
    userId: string
    authConfigId: string
    status: string
    toolkit: string
}

export async function getConnectedAccount(id: string): Promise<ComposioConnectedAccount> {
    const data = await composioFetch<{ id: string; user_id: string; status: string; auth_config?: { id?: string }; toolkit?: { slug?: string } }>(`/connected_accounts/${encodeURIComponent(id)}`)
    return { id: data.id, userId: data.user_id, authConfigId: data.auth_config?.id ?? '', status: data.status, toolkit: data.toolkit?.slug ?? '' }
}

export async function deleteConnectedAccount(id: string): Promise<void> {
    await composioFetch<{ success?: boolean }>(`/connected_accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type ComposioTool = {
    slug: string
    name: string
    description: string
    inputParameters: Record<string, unknown>
}

type ComposioToolRow = { slug?: string; name?: string; description?: string; input_parameters?: Record<string, unknown> }

const toolsCache = new Map<string, { tools: ComposioTool[]; fetchedAt: number }>()

// A stale list is far better than an agent session with no tools at all, so an expired cache
// entry is served when Composio itself is the thing failing.
export async function listToolkitTools(toolkit: string): Promise<ComposioTool[]> {
    const cached = toolsCache.get(toolkit)
    if (cached && Date.now() - cached.fetchedAt < TOOLS_CACHE_TTL_MS) return cached.tools

    try {
        const tools: ComposioTool[] = []
        let cursor: string | null = null
        do {
            const params = new URLSearchParams({ toolkit_slug: toolkit })
            if (cursor) params.set('cursor', cursor)
            const page: { items?: ComposioToolRow[]; next_cursor?: string | null } = await composioFetch(`/tools?${params.toString()}`)
            for (const t of page.items ?? []) {
                if (!t.slug) continue
                tools.push({ slug: t.slug, name: t.name ?? t.slug, description: t.description ?? '', inputParameters: t.input_parameters ?? { type: 'object', properties: {} } })
            }
            cursor = page.next_cursor ?? null
        } while (cursor)

        toolsCache.set(toolkit, { tools, fetchedAt: Date.now() })
        return tools
    } catch (err) {
        if (cached) {
            console.warn(`[composio] tools/list for ${toolkit} failed, serving stale cache:`, err instanceof Error ? err.message : err)
            return cached.tools
        }
        throw err
    }
}

export type ComposioExecuteResult = { successful: boolean; data: unknown; error: string | null }

export async function executeTool(toolSlug: string, userId: string, args: Record<string, unknown>): Promise<ComposioExecuteResult> {
    const data = await composioFetch<{ successful?: boolean; data?: unknown; error?: string | null }>(`/tools/execute/${encodeURIComponent(toolSlug)}`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, arguments: args }),
    })
    return { successful: Boolean(data.successful), data: data.data ?? null, error: data.error ?? null }
}

export type ComposioAuthConfig = {
    id: string
    name: string
    toolkit: string
    authScheme: string | null
    composioManaged: boolean
    enabled: boolean
}

type ComposioAuthConfigRow = { id?: string; name?: string; status?: string; auth_scheme?: string; is_composio_managed?: boolean; toolkit?: { slug?: string } }

const AUTH_CONFIGS_PAGE_SIZE = 200
const AUTH_CONFIGS_MAX_PAGES = 20
// The admin panel waits on these calls: a Composio that hangs answers an error instead.
const ADMIN_CALL_TIMEOUT_MS = 10_000

export async function listAuthConfigs(apiKey?: string): Promise<ComposioAuthConfig[]> {
    const configs: ComposioAuthConfig[] = []
    let cursor: string | null = null
    for (let page = 0; page < AUTH_CONFIGS_MAX_PAGES; page++) {
        const params = new URLSearchParams({ limit: String(AUTH_CONFIGS_PAGE_SIZE) })
        if (cursor) params.set('cursor', cursor)
        const body: { items?: ComposioAuthConfigRow[]; next_cursor?: string | null } = await composioFetch(`/auth_configs?${params.toString()}`, { signal: AbortSignal.timeout(ADMIN_CALL_TIMEOUT_MS) }, apiKey)
        for (const row of body.items ?? []) {
            if (!row.id) continue
            configs.push({
                id: row.id,
                name: row.name ?? row.id,
                toolkit: (row.toolkit?.slug ?? '').toLowerCase(),
                authScheme: row.auth_scheme ?? null,
                composioManaged: Boolean(row.is_composio_managed),
                enabled: row.status !== 'DISABLED',
            })
        }
        cursor = body.next_cursor ?? null
        if (!cursor) break
    }
    return configs
}

// An auth config on Composio's own OAuth app: the quickest way to connect a toolkit, offered by
// Composio for most of them. A toolkit it does not cover answers an error, and the admin creates
// one with their own OAuth app in Composio's dashboard instead.
export async function createManagedAuthConfig(toolkit: string): Promise<string> {
    const data = await composioFetch<{ auth_config?: { id?: string } }>('/auth_configs', {
        method: 'POST',
        signal: AbortSignal.timeout(ADMIN_CALL_TIMEOUT_MS),
        body: JSON.stringify({ toolkit: { slug: toolkit }, auth_config: { type: 'use_composio_managed_auth' } }),
    })
    if (!data.auth_config?.id) throw new ComposioApiError(502, 'Composio did not return the id of the new auth config')
    return data.auth_config.id
}
