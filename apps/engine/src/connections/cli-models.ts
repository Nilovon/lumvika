import type { CliModels } from '@rerun/contracts'
import { clearAgentCache } from '../agents/registry.js'

// In memory, like the plan limits: a reading is only as good as the binary and the account it was
// taken against, and the next one refills it after a restart.
const readings = new Map<string, CliModels>()

// Models a run was turned down on although the CLI listed them, with when. The provider's answer to
// a real request outranks its list, until the credential changes or the refusal expires: a plan
// upgraded on the same account brings the model back without a reconnect.
const refusals = new Map<string, Map<string, number>>()

export const REFUSAL_TTL_MS = 6 * 60 * 60 * 1000

const servedKey = (models: string[]): string => [...models].sort().join('\n')

// Every cached agent holds a pair resolved against the previous reading: one following the box
// default has to be resolved again once a model it runs turns out to be refused.
function servedSetChanged(connectionId: string, before: CliModels | null): void {
    const after = readCliModels(connectionId)
    if (servedKey(before?.models ?? []) !== servedKey(after?.models ?? [])) clearAgentCache()
}

export function recordCliModels(connectionId: string, models: string[], version: string | null, outdated: boolean): void {
    if (!models.length) return
    const before = readCliModels(connectionId)
    readings.set(connectionId, { models: [...new Set(models)], version, outdated, capturedAt: new Date().toISOString() })
    servedSetChanged(connectionId, before)
}

export function recordRefusedModel(connectionId: string, model: string): void {
    const before = readCliModels(connectionId)
    const refused = refusals.get(connectionId) ?? new Map<string, number>()
    refused.set(model, Date.now())
    refusals.set(connectionId, refused)
    servedSetChanged(connectionId, before)
}

export function readCliModels(connectionId: string): CliModels | null {
    const reading = readings.get(connectionId)
    if (!reading) return null
    const refused = liveRefusals(connectionId)
    return refused.size ? { ...reading, models: reading.models.filter(model => !refused.has(model)) } : reading
}

function liveRefusals(connectionId: string): Map<string, number> {
    const refused = refusals.get(connectionId) ?? new Map<string, number>()
    for (const [model, at] of refused) if (Date.now() - at >= REFUSAL_TTL_MS) refused.delete(model)
    return refused
}

export function forgetCliModels(connectionId: string): void {
    readings.delete(connectionId)
    refusals.delete(connectionId)
}

export function cliModelsFresh(connectionId: string, maxAgeMs: number): boolean {
    const reading = readings.get(connectionId)
    return !!reading && Date.now() - Date.parse(reading.capturedAt) < maxAgeMs
}
