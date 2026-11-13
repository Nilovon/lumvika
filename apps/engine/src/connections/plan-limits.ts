import { opencodeUsageSchema, type PlanExtraUsage, type PlanLimitWindow, type PlanLimits } from '@lumvika/contracts'

// What one read of a subscription says, before the store dates it.
export type PlanLimitsReading = Pick<PlanLimits, 'windows' | 'plan' | 'extraUsage' | 'unavailable'>

export const PROBE_FAILED: PlanLimitsReading = { windows: [], unavailable: { reason: 'probeFailed' } }

const SESSION_MINS = 5 * 60
const WEEK_MINS = 7 * 24 * 60
const MONTH_MINS = 30 * 24 * 60

// Kept in memory on purpose: a reading is only as good as its age, and the next run or the next
// read refills it. Nothing here is worth a file a restored data-dir would have to carry.
const readings = new Map<string, PlanLimits>()

// A read that failed never wipes the bars a good one left: they stay, dated, with the failure noted
// beside them. A failure with nothing to keep is shown as one.
export function recordPlanLimitsReading(connectionId: string, reading: PlanLimitsReading, now = new Date()): void {
    const at = now.toISOString()
    const previous = readings.get(connectionId)
    if (reading.unavailable?.reason === 'probeFailed' && previous?.windows.length) {
        readings.set(connectionId, { ...previous, refreshFailedAt: at })
        return
    }
    readings.set(connectionId, {
        windows: sortWindows(reading.windows),
        capturedAt: at,
        plan: reading.plan ?? previous?.plan ?? null,
        extraUsage: reading.extraUsage ?? null,
        unavailable: reading.unavailable ?? null,
        refreshFailedAt: null,
    })
}

// The windows a run's end reads on its way out: an empty answer says nothing, so it is dropped.
export function recordPlanLimits(connectionId: string, windows: PlanLimitWindow[]): void {
    if (!windows.length) return
    const previous = readings.get(connectionId)
    recordPlanLimitsReading(connectionId, { windows, plan: previous?.plan, extraUsage: previous?.extraUsage })
}

export function readPlanLimits(connectionId: string): PlanLimits | null {
    return readings.get(connectionId) ?? null
}

export function forgetPlanLimits(connectionId: string): void {
    readings.delete(connectionId)
}

const KIND_ORDER: Record<PlanLimitWindow['kind'], number> = { session: 0, weekly: 1, model: 2, monthly: 3 }

function sortWindows(windows: PlanLimitWindow[]): PlanLimitWindow[] {
    return [...windows].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

export function clampPercent(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

type ClaudeWindow = { utilization?: number | null; resets_at?: string | null } | null

type ClaudeMoney = { amount_minor?: number; currency?: string; exponent?: number }

// The part of Claude Code's `/usage` answer read here. Every field is optional because the SDK
// ships it as experimental: a shape that moved must read as "no reading", never throw.
export type ClaudePlanUsage = {
    subscription_type?: string | null
    rate_limits_available?: boolean
    rate_limits?: {
        five_hour?: ClaudeWindow
        seven_day?: ClaudeWindow
        seven_day_opus?: ClaudeWindow
        seven_day_sonnet?: ClaudeWindow
        model_scoped?: ({ display_name?: string } & NonNullable<ClaudeWindow>)[]
        extra_usage?: { is_enabled?: boolean; monthly_limit?: number | null; used_credits?: number | null; utilization?: number | null } | null
        // Not typed by the SDK yet: the spend budget the CLI reports beside the extra usage.
        spend?: { enabled?: boolean; used?: ClaudeMoney; limit?: ClaudeMoney } | null
    } | null
}

const scopeToken = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

function claudeWindow(id: string, kind: PlanLimitWindow['kind'], label: string | null, window: ClaudeWindow | undefined): PlanLimitWindow[] {
    if (typeof window?.utilization !== 'number') return []
    return [{ id, kind, label, usedPercent: clampPercent(window.utilization), resetsAt: window.resets_at ?? null, windowDurationMins: kind === 'session' ? SESSION_MINS : WEEK_MINS }]
}

function percentOf(used: number | null | undefined, limit: number | null | undefined): number | null {
    if (typeof used !== 'number' || typeof limit !== 'number' || !Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) return null
    return clampPercent((used / limit) * 100)
}

// The spend budget is the exact figure when both amounts are in the same currency and scale; the
// extra usage's own ratio, then its rounded utilization, are the fallbacks.
function claudeExtraUsage(limits: NonNullable<ClaudePlanUsage['rate_limits']>): PlanExtraUsage | null {
    const extra = limits.extra_usage
    if (!extra || typeof extra.is_enabled !== 'boolean') return null
    const spend = limits.spend
    const sameScale = !!spend?.enabled && !!spend.used?.currency && spend.used.currency === spend.limit?.currency && spend.used.exponent === spend.limit?.exponent
    const utilization = typeof extra.utilization === 'number' && Number.isFinite(extra.utilization) ? clampPercent(extra.utilization) : null
    const usedPercent = (sameScale ? percentOf(spend?.used?.amount_minor, spend?.limit?.amount_minor) : null) ?? percentOf(extra.used_credits, extra.monthly_limit) ?? utilization
    return { enabled: extra.is_enabled, usedPercent: extra.is_enabled ? usedPercent : null, zeroCap: extra.is_enabled && extra.monthly_limit === 0 }
}

// Null when there is no answer at all: what that means (a timeout, a CLI that moved the call) is
// the caller's to say.
export function planLimitsFromClaude(usage: ClaudePlanUsage | null | undefined): PlanLimitsReading | null {
    if (!usage) return null
    const plan = usage.subscription_type ?? null
    if (usage.rate_limits_available === false) return { windows: [], plan, unavailable: { reason: 'unsupported' } }
    const limits = usage.rate_limits
    if (!limits) return { windows: [], plan, unavailable: { reason: 'probeFailed' } }
    // `model_scoped` is the newer list and names the same buckets as the two fixed fields, so the
    // fixed fields only speak when it is absent.
    const scoped = (limits.model_scoped ?? []).flatMap(w => (w.display_name ? claudeWindow(`seven_day_${scopeToken(w.display_name)}`, 'model', w.display_name, w) : []))
    const models = scoped.length ? scoped : [...claudeWindow('seven_day_opus', 'model', 'Opus', limits.seven_day_opus), ...claudeWindow('seven_day_sonnet', 'model', 'Sonnet', limits.seven_day_sonnet)]
    const windows = [...claudeWindow('five_hour', 'session', null, limits.five_hour), ...claudeWindow('seven_day', 'weekly', null, limits.seven_day), ...models]
    return { windows, plan, extraUsage: claudeExtraUsage(limits) }
}

export function planLimitWindowsFromClaude(usage: ClaudePlanUsage | null | undefined): PlanLimitWindow[] {
    return planLimitsFromClaude(usage)?.windows ?? []
}

type CodexWindow = { usedPercent?: number | null; windowDurationMins?: number | null; resetsAt?: number | null } | null

type CodexSnapshot = {
    limitId?: string | null
    planType?: string | null
    primary?: CodexWindow
    secondary?: CodexWindow
    individualLimit?: { remainingPercent?: number | null; resetsAt?: number | null } | null
}

// The part of the app-server's `account/rateLimits/read` answer read here. `rateLimitsByLimitId`
// carries one snapshot per metered pool: `codex` is the plan's own, the others are per model.
export type CodexRateLimits = { rateLimits?: CodexSnapshot | null; rateLimitsByLimitId?: Record<string, CodexSnapshot | null> | null }

const DAY_MINUTES = 24 * 60

function isoFromEpochSeconds(value: number | null | undefined): string | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null
}

// Codex does not say which window is which, and a plan with a single weekly cap reports it as
// `primary`. The duration is the only reliable tell; the slot is the fallback when it is missing.
function codexWindow(id: string, window: CodexWindow | undefined, fallback: PlanLimitWindow['kind']): PlanLimitWindow[] {
    if (typeof window?.usedPercent !== 'number') return []
    const minutes = typeof window.windowDurationMins === 'number' ? window.windowDurationMins : null
    const kind = minutes === null ? fallback : minutes <= DAY_MINUTES ? 'session' : minutes >= MONTH_MINS ? 'monthly' : 'weekly'
    return [{ id, kind, label: null, usedPercent: clampPercent(window.usedPercent), resetsAt: isoFromEpochSeconds(window.resetsAt), windowDurationMins: minutes }]
}

export function planLimitsFromCodex(response: CodexRateLimits | null | undefined): PlanLimitsReading | null {
    const snapshot = response?.rateLimitsByLimitId?.codex ?? response?.rateLimits
    // A per-model pool reported alone must not pass for the plan's allowance.
    if (!snapshot || (snapshot.limitId && snapshot.limitId !== 'codex')) return null
    const windows = [...codexWindow('primary', snapshot.primary, 'session'), ...codexWindow('secondary', snapshot.secondary, 'weekly')]
    const individual = snapshot.individualLimit
    if (typeof individual?.remainingPercent === 'number') {
        windows.push({ id: 'individual', kind: 'monthly', label: null, usedPercent: clampPercent(100 - individual.remainingPercent), resetsAt: isoFromEpochSeconds(individual.resetsAt), windowDurationMins: null })
    }
    return windows.length ? { windows, plan: snapshot.planType ?? null } : null
}

export function planLimitWindowsFromCodex(response: CodexRateLimits | null | undefined): PlanLimitWindow[] {
    return planLimitsFromCodex(response)?.windows ?? []
}

// OpenCode Go's `/usage` names its windows outright: `rolling` is the five-hour one. A window it
// answers with a status other than `ok` is spent whatever the percentage says. A month has no fixed
// length, so its window carries none and draws no pace.
const OPENCODE_WINDOWS = [
    ['rolling', 'session', SESSION_MINS],
    ['weekly', 'weekly', WEEK_MINS],
    ['monthly', 'monthly', null],
] as const

export function planLimitWindowsFromOpencode(body: unknown): PlanLimitWindow[] {
    const parsed = opencodeUsageSchema.safeParse(body)
    if (!parsed.success) return []
    return OPENCODE_WINDOWS.flatMap(([field, kind, windowDurationMins]) => {
        const window = parsed.data.usage[field]
        if (!window) return []
        const usedPercent = window.status === 'ok' ? window.percent : Math.max(window.percent, 100)
        return [{ id: field, kind, label: null, usedPercent, resetsAt: window.resetsAt ?? null, windowDurationMins }]
    })
}

// The window a refused call ran into, when the last reading says one is spent.
export function spentPlanWindow(connectionId: string): PlanLimitWindow | null {
    return readings.get(connectionId)?.windows.find(window => window.usedPercent >= 100) ?? null
}

// A spent subscription fails every run within seconds until its window resets, so the scheduler
// holds the connection's schedules until then. The reset time is read when the hold is checked, not
// when it is armed: Codex and OpenCode refresh their windows during the run's teardown, seconds
// after the refusal armed the hold, and Claude only reads its usage when a run ends well, so the
// reading a refused run leaves behind can still be under 100%. Without a reset time the hold lasts
// PLAN_LIMIT_PROBE_MS, and the next due run is the probe.
const PLAN_LIMIT_PROBE_MS = 30 * 60_000

const limitLatches = new Map<string, number>()

export function armPlanLimitLatch(connectionId: string, now = Date.now()): void {
    limitLatches.set(connectionId, now)
}

export function clearPlanLimitLatch(connectionId: string): void {
    limitLatches.delete(connectionId)
}

export function isPlanLimitLatched(connectionId: string, now = Date.now()): boolean {
    const armedAt = limitLatches.get(connectionId)
    if (armedAt === undefined) return false
    const resetsAt = Date.parse(spentPlanWindow(connectionId)?.resetsAt ?? '')
    return now < (resetsAt > armedAt ? resetsAt : armedAt + PLAN_LIMIT_PROBE_MS)
}
