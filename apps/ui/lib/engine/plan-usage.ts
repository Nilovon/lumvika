import type { PlanLimitWindow, TokenUsage, TokenUsageTotals } from '@lumvika/contracts'

const MINUTE_MS = 60_000

// Adapted from T3 Code's usage limits view (MIT, packages/shared/src/usageLimits.ts): the share of a
// window gone by, and whether the plan is spent faster or slower than time passes.

// A gap smaller than this either way reads as on pace: a reading is rounded, and so is the clock.
const PACE_TOLERANCE = 5

export type LimitPace = 'ahead' | 'on' | 'under'

export function remainingPercent(window: Pick<PlanLimitWindow, 'usedPercent'>): number {
    return Math.round(100 - Math.max(0, Math.min(100, window.usedPercent)))
}

// Needs both the reset and the length: a window whose length the provider did not give draws no pace.
export function elapsedShare(window: Pick<PlanLimitWindow, 'resetsAt' | 'windowDurationMins'>, now: number): number | null {
    const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN
    const length = (window.windowDurationMins ?? 0) * MINUTE_MS
    if (!Number.isFinite(resetsAt) || length <= 0) return null
    return Math.max(0, Math.min(1, (length - (resetsAt - now)) / length))
}

export function paceOf(window: Pick<PlanLimitWindow, 'usedPercent' | 'resetsAt' | 'windowDurationMins'>, now: number): LimitPace | null {
    const elapsed = elapsedShare(window, now)
    if (elapsed === null) return null
    const gap = window.usedPercent - elapsed * 100
    if (gap > PACE_TOLERANCE) return 'ahead'
    if (gap < -PACE_TOLERANCE) return 'under'
    return 'on'
}

// Every input token, cached or not, is in `inputTokens`: what the cache neither served nor stored is
// the rest. Floored at zero, since a provider that reports cache writes outside the input total
// would otherwise draw a negative bar.
export function uncachedInputTokens(totals: TokenUsageTotals): number {
    return Math.max(0, totals.inputTokens - totals.cacheReadTokens - totals.cacheWriteTokens)
}

export function cacheHitRate(totals: TokenUsageTotals): number | null {
    return totals.inputTokens > 0 ? Math.min(1, totals.cacheReadTokens / totals.inputTokens) : null
}

export function tokenUsageOf(usage: TokenUsage | null, provider: string) {
    return usage?.providers.find(entry => entry.provider === provider) ?? null
}
