// A "managed" service: Rerun is the OAuth client (one app for everyone) AND the API gateway.
// The agent's tool points at a Rerun endpoint (/api/mcp/managed/<provider>), not the third
// party. Rerun runs the authenticated calls server-side, so the user never touches a
// developer console. The OAuth token still lives on the ENGINE token store (never Supabase);
// Rerun only sees it transiently, forwarded per request in the Authorization header.

export type ManagedToolDef = {
    name: string
    description: string
    inputSchema: Record<string, unknown>
}

// A tool the provider runs itself against the third-party API, given a live access token.
export type ManagedTool = ManagedToolDef & {
    execute: (args: Record<string, unknown>, accessToken: string) => Promise<unknown>
}

export type ManagedOAuthConfig = {
    authorizationEndpoint: string
    tokenEndpoint: string
    scopes: string[]
    clientIdEnv: string
    clientSecretEnv: string
    // Extra authorize params (e.g. access_type=offline, prompt=consent) needed to obtain a
    // refresh token so the engine can refresh unattended.
    authorizeParams?: Record<string, string>
    // Resolve the connected account's display label (e.g. email) from an access token, so the
    // UI can show "Connected as x@gmail.com". Best-effort.
    accountEmail?: (accessToken: string) => Promise<string | undefined>
}

export type ManagedProvider = {
    id: string
    label: string
    oauth: ManagedOAuthConfig
    tools: ManagedTool[]
}

export function toolDefs(provider: ManagedProvider): ManagedToolDef[] {
    return provider.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

export function getTool(provider: ManagedProvider, name: string): ManagedTool | undefined {
    return provider.tools.find(t => t.name === name)
}
