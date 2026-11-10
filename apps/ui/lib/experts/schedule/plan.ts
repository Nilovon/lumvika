import { hashSeed, mulberry32, shuffled } from './rng'
import {
    DAY_MS,
    DEFAULT_WINDOW,
    MINUTE_MS,
    capDayKey,
    isValidTimeZone,
    localWindowCloseAt,
    nextEligibleAt,
    startOfNextCapDay,
    type LocalWindow,
} from './window'

export type PlannableExpert = { id: string; timezone: string }

export type PlanParams = {
    startAt: Date
    dailyCap: number
    minGapMinutes: number
    jitterMinutes: number
    seed: string
    window?: LocalWindow
    /** Reference zone the daily cap is counted in. Never the expert's zone, see below. */
    capTimeZone?: string
    maxHorizonDays?: number
}

export type UnschedulableReason = 'invalid-timezone' | 'empty-window' | 'horizon-exceeded'

export type PlanResult = {
    scheduled: { id: string; sendAt: Date }[]
    unschedulable: { id: string; reason: UnschedulableReason }[]
}

const DEFAULT_CAP_TIMEZONE = 'UTC'
const DEFAULT_MAX_HORIZON_DAYS = 90
const FAIRNESS_EPSILON = 1e-9

type Bucket = {
    timezone: string
    queue: PlannableExpert[]
    size: number
    sent: number
    readyAt: Date | null
    /** Share of the current day's cap reserved for this timezone, and what it has used of it. */
    dayQuota: number
    dayUsed: number
}

/**
 * Spreads a cold outreach campaign over time: every send lands inside the recipient's local working
 * window, no two sends are closer than minGapMinutes, and no calendar day exceeds dailyCap.
 *
 * Pure by design (no Date.now, no Math.random) so the operator's preview and the plan that gets
 * scheduled are the same object, and so the whole thing is unit-testable.
 */
export function planInviteCampaign(experts: readonly PlannableExpert[], params: PlanParams): PlanResult {
    const window = params.window ?? DEFAULT_WINDOW
    const capTimeZone = params.capTimeZone ?? DEFAULT_CAP_TIMEZONE
    const horizon = new Date(params.startAt.getTime() + (params.maxHorizonDays ?? DEFAULT_MAX_HORIZON_DAYS) * DAY_MS)
    const minGapMs = Math.max(0, params.minGapMinutes) * MINUTE_MS
    const shuffle = mulberry32(hashSeed(`${params.seed}:shuffle`))

    const scheduled: PlanResult['scheduled'] = []
    const unschedulable: PlanResult['unschedulable'] = []
    const buckets: Bucket[] = []

    for (const [timezone, members] of groupByTimezone(experts)) {
        if (!isValidTimeZone(timezone)) {
            for (const expert of members) unschedulable.push({ id: expert.id, reason: 'invalid-timezone' })
            continue
        }
        const readyAt = nextEligibleAt(params.startAt, timezone, window)
        if (!readyAt) {
            for (const expert of members) unschedulable.push({ id: expert.id, reason: 'empty-window' })
            continue
        }
        // The DB order (created_at desc) would otherwise leak into the send order.
        buckets.push({ timezone, queue: shuffled(members, shuffle), size: members.length, sent: 0, readyAt, dayQuota: 0, dayUsed: 0 })
    }

    buckets.sort((a, b) => (a.timezone < b.timezone ? -1 : 1))

    const capCounts = new Map<string, number>()
    let cursor = params.startAt
    let currentDay = ''

    while (buckets.some(bucket => bucket.queue.length > 0)) {
        if (cursor.getTime() > horizon.getTime()) {
            for (const bucket of buckets) {
                for (const expert of bucket.queue) unschedulable.push({ id: expert.id, reason: 'horizon-exceeded' })
                bucket.queue = []
            }
            break
        }

        const day = capDayKey(cursor, capTimeZone)
        const dayEnd = startOfNextCapDay(cursor, capTimeZone)
        if (day !== currentDay) {
            currentDay = day
            reserveDailyQuotas(buckets, params.dailyCap)
        }
        if ((capCounts.get(day) ?? 0) >= params.dailyCap) {
            cursor = dayEnd
            continue
        }

        const pending: Bucket[] = []
        for (const bucket of buckets) {
            if (bucket.queue.length === 0) continue
            const from = !bucket.readyAt || bucket.readyAt.getTime() < cursor.getTime() ? cursor : bucket.readyAt
            bucket.readyAt = nextEligibleAt(from, bucket.timezone, window)
            if (!bucket.readyAt) {
                for (const expert of bucket.queue) unschedulable.push({ id: expert.id, reason: 'empty-window' })
                bucket.queue = []
                continue
            }
            pending.push(bucket)
        }
        if (pending.length === 0) break

        const bucket = pickBucket(pending, cursor, dayEnd)
        if (!bucket) {
            // Nobody who can be served right now: jump straight to the next zone that opens rather
            // than spinning through empty slots. pickBucket only returns null when such a zone
            // exists, so this always moves the cursor forward.
            cursor = new Date(Math.min(...pending.filter(candidate => candidate.readyAt!.getTime() > cursor.getTime()).map(candidate => candidate.readyAt!.getTime())))
            continue
        }

        const expert = bucket.queue.shift()!
        const sendAt = applyJitter(cursor, expert, bucket.timezone, window, capTimeZone, params)

        scheduled.push({ id: expert.id, sendAt })
        capCounts.set(day, (capCounts.get(day) ?? 0) + 1)
        bucket.sent++
        bucket.dayUsed++
        cursor = new Date(sendAt.getTime() + minGapMs)
    }

    return { scheduled, unschedulable }
}

/**
 * Each timezone gets a share of the day proportional to how many people it still owes. Without
 * this reservation the eastern zones, whose local morning comes first in UTC, would spend the whole
 * cap before Europe or the Americas wake up.
 */
function reserveDailyQuotas(buckets: Bucket[], dailyCap: number): void {
    const remaining = buckets.reduce((total, bucket) => total + bucket.queue.length, 0)
    for (const bucket of buckets) {
        bucket.dayUsed = 0
        bucket.dayQuota = remaining === 0 ? 0 : (dailyCap * bucket.queue.length) / remaining
    }
}

/**
 * Prefers a zone that is both open right now and still within its reservation, least-served first.
 * When every open zone has spent its share, the slot is held for a zone that opens later today;
 * only once none is left does the leftover capacity go to whoever happens to be open.
 */
function pickBucket(pending: Bucket[], cursor: Date, dayEnd: Date): Bucket | null {
    const openNow = pending.filter(bucket => bucket.readyAt!.getTime() <= cursor.getTime())
    const reserved = openNow.filter(bucket => bucket.dayUsed < bucket.dayQuota)
    if (reserved.length > 0) return leastServed(reserved)

    const reservedLater = pending.some(
        bucket => bucket.dayUsed < bucket.dayQuota && bucket.readyAt!.getTime() > cursor.getTime() && bucket.readyAt!.getTime() < dayEnd.getTime(),
    )
    if (reservedLater) return null

    return openNow.length > 0 ? leastServed(openNow) : null
}

function leastServed(buckets: Bucket[]): Bucket {
    return buckets.reduce((best, candidate) => (virtualTime(candidate) < virtualTime(best) - FAIRNESS_EPSILON ? candidate : best))
}

function virtualTime(bucket: Bucket): number {
    return bucket.sent / bucket.size
}

/**
 * Jitter is forward-only, which keeps the minimum gap invariant for free: the next cursor is
 * sendAt + minGap and the next send is at or after that cursor. The clamps stop the jitter from
 * pushing a send past the local window or across the cap-day boundary it was counted against.
 */
function applyJitter(
    cursor: Date,
    expert: PlannableExpert,
    timezone: string,
    window: LocalWindow,
    capTimeZone: string,
    params: PlanParams,
): Date {
    if (params.jitterMinutes <= 0) return cursor

    // Keying the jitter on the expert id keeps a re-plan minimal: adding or removing one expert
    // does not re-draw everybody else's offset.
    const random = mulberry32(hashSeed(`${params.seed}:jitter:${expert.id}`))()
    let sendAt = cursor.getTime() + Math.floor(random * (params.jitterMinutes * MINUTE_MS + 1))

    const windowClose = localWindowCloseAt(cursor, timezone, window)
    if (windowClose) sendAt = Math.min(sendAt, windowClose.getTime() - MINUTE_MS)
    sendAt = Math.min(sendAt, startOfNextCapDay(cursor, capTimeZone).getTime() - MINUTE_MS)

    return new Date(Math.max(sendAt, cursor.getTime()))
}

function groupByTimezone(experts: readonly PlannableExpert[]): Map<string, PlannableExpert[]> {
    const groups = new Map<string, PlannableExpert[]>()
    for (const expert of experts) {
        const members = groups.get(expert.timezone)
        if (members) members.push(expert)
        else groups.set(expert.timezone, [expert])
    }
    return groups
}
