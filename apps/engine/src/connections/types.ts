import type { ConnectionConfig } from '@lumvika/contracts'

export { connectionConfigSchema, LUMVIKA_CONNECTION_ID } from '@lumvika/contracts'
export type { ConnectionConfig, ConnectionSummary } from '@lumvika/contracts'

// The credentials live in `env`, never in `config` — nothing that reaches the API carries them.
export type LoadedConnection = {
    id: string
    config: ConnectionConfig
    env: Record<string, string>
}
