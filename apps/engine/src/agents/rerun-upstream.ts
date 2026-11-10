import { rerunUpstreamModelsSchema, type Provider } from '@rerun/contracts'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

// The hub can swap the model behind an alias, or serve Smart with Balanced once a trial starts,
// without the box knowing: what it last said is asked again after this long.
const FRESH_MS = 5 * 60_000
// A run that finds nothing known yet waits this long at most, then goes on without it.
const FIRST_WAIT_MS = 2_000
const FETCH_TIMEOUT_MS = 10_000

let known: Record<string, string> | undefined
let askedAt = -Infinity

async function askHub(): Promise<void> {
    const { RERUN_HUB_BASE_URL: hub, RERUN_API_KEY: token } = env()
    if (!hub || !token) return
    const res = await fetch(`${hub.replace(/\/$/, '')}/api/llm/models`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`hub answered ${res.status}`)
    known = rerunUpstreamModelsSchema.parse(await res.json()).models
}

// A hub that fails or predates the route is asked again only once FRESH_MS has passed, so a run
// never waits on it twice in a row and the alias stands for itself meanwhile.
async function upstreamModels(): Promise<Record<string, string>> {
    if (Date.now() - askedAt >= FRESH_MS) {
        askedAt = Date.now()
        const asking = askHub().catch(err => logger.warn({ err: String(err) }, 'rerun upstream models unavailable'))
        if (!known) await Promise.race([asking, new Promise(resolve => setTimeout(resolve, FIRST_WAIT_MS).unref())])
    }
    return known ?? {}
}

// The model that answers a run: behind a Rerun alias, the one the hub serves it with.
export async function answeringModel(provider: Provider, model: string): Promise<string> {
    if (provider !== 'rerun') return model
    return (await upstreamModels())[model] ?? model
}
