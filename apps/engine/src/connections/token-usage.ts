import type { TokenUsage, TokenUsageProvider, TokenUsageRange, TokenUsageTotals } from '@lumvika/contracts'
import { listAgentIdsOnDisk, readAgentConfig } from '../agents/loader.js'
import { aggregateTokenUsageByProvider } from '../db/repos/runs.js'

const DAY_MS = 24 * 60 * 60_000
const RANGE_MS: Record<TokenUsageRange, number> = { '7d': 7 * DAY_MS, '30d': 30 * DAY_MS }

const EMPTY_TOTALS: TokenUsageTotals = { runCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costMicros: 0 }

function addTotals(a: TokenUsageTotals, b: TokenUsageTotals): TokenUsageTotals {
    return {
        runCount: a.runCount + b.runCount,
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
        cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
        reasoningTokens: a.reasoningTokens + b.reasoningTokens,
        costMicros: a.costMicros + b.costMicros,
    }
}

const volume = (totals: TokenUsageTotals): number => totals.inputTokens + totals.outputTokens

// Each agent keeps its runs in a database of its own, so the box-wide figure is their sum.
export async function readTokenUsage(range: TokenUsageRange, now = Date.now()): Promise<TokenUsage> {
    const since = new Date(now - RANGE_MS[range]).toISOString()
    const providers = new Map<string, TokenUsageProvider>()
    for (const agentId of await listAgentIdsOnDisk()) {
        const rows = await aggregateTokenUsageByProvider(agentId, since)
        if (!rows.length) continue
        const agentName = await readAgentConfig(agentId)
            .then(config => config.name)
            .catch(() => agentId)
        for (const { provider, ...totals } of rows) {
            const entry = providers.get(provider) ?? { provider, totals: EMPTY_TOTALS, agents: [] }
            entry.totals = addTotals(entry.totals, totals)
            entry.agents.push({ agentId, agentName, ...totals })
            providers.set(provider, entry)
        }
    }
    const sorted = [...providers.values()].map(entry => ({ ...entry, agents: entry.agents.sort((a, b) => volume(b) - volume(a)) }))
    return { range, since, providers: sorted.sort((a, b) => volume(b.totals) - volume(a.totals)) }
}
