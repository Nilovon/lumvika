import { ENGINE_DEFAULT_PORT } from './constants'

// `engine_pool.engine_host` holds the rerun-engine host of a workspace's machine. Accept a bare
// host, host:port, or a full URL.
export function buildBaseUrl(host: string): string {
    const trimmed = host.trim().replace(/\/$/, '')
    if (/^https?:\/\//.test(trimmed)) return trimmed
    if (/:\d+$/.test(trimmed)) return `http://${trimmed}`
    return `http://${trimmed}:${ENGINE_DEFAULT_PORT}`
}
