import { describe, expect, it } from 'vitest'
import {
    PROBE_FAILED,
    armPlanLimitLatch,
    clearPlanLimitLatch,
    isPlanLimitLatched,
    forgetPlanLimits,
    planLimitWindowsFromClaude,
    planLimitWindowsFromCodex,
    planLimitWindowsFromOpencode,
    planLimitsFromClaude,
    planLimitsFromCodex,
    readPlanLimits,
    recordPlanLimits,
    recordPlanLimitsReading,
} from './plan-limits.js'

describe('planLimitsFromClaude', () => {
    it('reads the session, weekly and per-model windows with their ids and lengths', () => {
        const windows = planLimitWindowsFromClaude({
            rate_limits: {
                five_hour: { utilization: 42, resets_at: '2026-10-05T15:00:00Z' },
                seven_day: { utilization: 71, resets_at: '2026-10-09T08:00:00Z' },
                seven_day_opus: { utilization: 12, resets_at: null },
                seven_day_sonnet: null,
            },
        })
        expect(windows).toEqual([
            { id: 'five_hour', kind: 'session', label: null, usedPercent: 42, resetsAt: '2026-10-05T15:00:00Z', windowDurationMins: 300 },
            { id: 'seven_day', kind: 'weekly', label: null, usedPercent: 71, resetsAt: '2026-10-09T08:00:00Z', windowDurationMins: 10080 },
            { id: 'seven_day_opus', kind: 'model', label: 'Opus', usedPercent: 12, resetsAt: null, windowDurationMins: 10080 },
        ])
    })

    it('prefers model_scoped over the fixed per-model fields naming the same buckets', () => {
        const windows = planLimitWindowsFromClaude({
            rate_limits: {
                seven_day_opus: { utilization: 12, resets_at: null },
                model_scoped: [{ display_name: 'Fable Max', utilization: 30, resets_at: '2026-10-09T08:00:00Z' }],
            },
        })
        expect(windows).toEqual([{ id: 'seven_day_fable_max', kind: 'model', label: 'Fable Max', usedPercent: 30, resetsAt: '2026-10-09T08:00:00Z', windowDurationMins: 10080 }])
    })

    it('clamps a utilization the endpoint reports past the bounds', () => {
        expect(planLimitWindowsFromClaude({ rate_limits: { five_hour: { utilization: 104, resets_at: null }, seven_day: { utilization: -3, resets_at: null } } }).map(w => w.usedPercent)).toEqual([100, 0])
    })

    it('names the plan and reads the extra usage beside the windows, never as one', () => {
        const reading = planLimitsFromClaude({
            subscription_type: 'max',
            rate_limits_available: true,
            rate_limits: { five_hour: { utilization: 10, resets_at: null }, extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1250, utilization: 24 } },
        })
        expect(reading?.plan).toBe('max')
        expect(reading?.windows.map(w => w.id)).toEqual(['five_hour'])
        expect(reading?.extraUsage).toEqual({ enabled: true, usedPercent: 25, zeroCap: false })
    })

    it('takes the spend budget when its amounts share a currency and a scale', () => {
        const sameScale = planLimitsFromClaude({
            rate_limits: {
                extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 1250, utilization: 24 },
                spend: { enabled: true, used: { amount_minor: 300, currency: 'USD', exponent: 2 }, limit: { amount_minor: 1000, currency: 'USD', exponent: 2 } },
            },
        })
        expect(sameScale?.extraUsage?.usedPercent).toBe(30)

        const mixed = planLimitsFromClaude({
            rate_limits: {
                extra_usage: { is_enabled: true, monthly_limit: null, used_credits: null, utilization: 24 },
                spend: { enabled: true, used: { amount_minor: 300, currency: 'USD', exponent: 2 }, limit: { amount_minor: 1000, currency: 'EUR', exponent: 2 } },
            },
        })
        expect(mixed?.extraUsage?.usedPercent).toBe(24)
    })

    it('flags a zero spending cap and reads no percentage off a disabled overflow', () => {
        expect(planLimitsFromClaude({ rate_limits: { extra_usage: { is_enabled: true, monthly_limit: 0, used_credits: 0, utilization: null } } })?.extraUsage).toEqual({ enabled: true, usedPercent: null, zeroCap: true })
        expect(planLimitsFromClaude({ rate_limits: { extra_usage: { is_enabled: false, monthly_limit: 5000, used_credits: 10, utilization: 1 } } })?.extraUsage).toEqual({ enabled: false, usedPercent: null, zeroCap: false })
    })

    it('says plan limits do not apply when the CLI says so, and that the read failed when it answers nothing', () => {
        expect(planLimitsFromClaude({ subscription_type: null, rate_limits_available: false, rate_limits: null })).toEqual({ windows: [], plan: null, unavailable: { reason: 'unsupported' } })
        expect(planLimitsFromClaude({ rate_limits_available: true, rate_limits: null })?.unavailable).toEqual({ reason: 'probeFailed' })
        expect(planLimitsFromClaude(undefined)).toBeNull()
    })

    it('reads no window off a session where plan limits do not apply', () => {
        expect(planLimitWindowsFromClaude({ rate_limits: null })).toEqual([])
        expect(planLimitWindowsFromClaude(undefined)).toEqual([])
        expect(planLimitWindowsFromClaude({ rate_limits: { five_hour: { utilization: null, resets_at: null } } })).toEqual([])
    })
})

describe('planLimitsFromCodex', () => {
    it('names a window after its duration, whichever slot reports it', () => {
        const weeklyOnly = planLimitWindowsFromCodex({ rateLimits: { primary: { usedPercent: 20, windowDurationMins: 10080, resetsAt: 1791580463 }, secondary: null } })
        expect(weeklyOnly).toEqual([{ id: 'primary', kind: 'weekly', label: null, usedPercent: 20, resetsAt: '2026-10-09T21:14:23.000Z', windowDurationMins: 10080 }])

        const both = planLimitWindowsFromCodex({
            rateLimits: { primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null }, secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: null } },
        })
        expect(both.map(w => w.kind)).toEqual(['session', 'weekly'])

        const monthly = planLimitWindowsFromCodex({ rateLimits: { primary: { usedPercent: 5, windowDurationMins: 43200, resetsAt: null } } })
        expect(monthly.map(w => w.kind)).toEqual(['monthly'])
    })

    it('falls back on the slot when the duration is missing, and claims no length it was not given', () => {
        const windows = planLimitWindowsFromCodex({ rateLimits: { primary: { usedPercent: 5 }, secondary: { usedPercent: 60 } } })
        expect(windows.map(w => [w.kind, w.windowDurationMins])).toEqual([
            ['session', null],
            ['weekly', null],
        ])
    })

    it("reads the plan's own pool, never a per-model one, and the member's credit limit", () => {
        const reading = planLimitsFromCodex({
            rateLimits: { limitId: 'gpt-6-sol', primary: { usedPercent: 99 } },
            rateLimitsByLimitId: { codex: { limitId: 'codex', planType: 'pro', primary: { usedPercent: 10, windowDurationMins: 300 }, individualLimit: { remainingPercent: 70, resetsAt: 1791580463 } } },
        })
        expect(reading?.plan).toBe('pro')
        expect(reading?.windows.map(w => [w.id, w.kind, w.usedPercent])).toEqual([
            ['primary', 'session', 10],
            ['individual', 'monthly', 30],
        ])
        expect(planLimitsFromCodex({ rateLimits: { limitId: 'gpt-6-sol', primary: { usedPercent: 99 } } })).toBeNull()
    })

    it('reads nothing off a failed read', () => {
        expect(planLimitWindowsFromCodex(null)).toEqual([])
        expect(planLimitWindowsFromCodex({ rateLimits: null })).toEqual([])
    })
})

describe('planLimitWindowsFromOpencode', () => {
    it('gives the rolling and weekly windows their length, the month none', () => {
        const windows = planLimitWindowsFromOpencode({ usage: { rolling: { percent: 10, status: 'ok' }, weekly: { percent: 20, status: 'ok' }, monthly: { percent: 30, status: 'ok' } } })
        expect(windows.map(w => [w.id, w.kind, w.windowDurationMins])).toEqual([
            ['rolling', 'session', 300],
            ['weekly', 'weekly', 10080],
            ['monthly', 'monthly', null],
        ])
    })
})

describe('plan limits store', () => {
    const session = { id: 'five_hour', kind: 'session' as const, label: null, usedPercent: 10, resetsAt: null, windowDurationMins: 300 }

    it('keeps the last reading when a later one comes back empty', () => {
        recordPlanLimits('c1', [session])
        recordPlanLimits('c1', [])
        expect(readPlanLimits('c1')?.windows).toHaveLength(1)
        forgetPlanLimits('c1')
        expect(readPlanLimits('c1')).toBeNull()
    })

    it('keeps the last good bars when a read fails, and dates the failure', () => {
        recordPlanLimitsReading('c2', { windows: [session], plan: 'max' }, new Date('2026-11-13T10:00:00Z'))
        recordPlanLimitsReading('c2', PROBE_FAILED, new Date('2026-11-13T10:05:00Z'))
        expect(readPlanLimits('c2')).toMatchObject({ windows: [session], plan: 'max', capturedAt: '2026-11-13T10:00:00.000Z', refreshFailedAt: '2026-11-13T10:05:00.000Z' })

        recordPlanLimitsReading('c2', { windows: [{ ...session, usedPercent: 20 }] }, new Date('2026-11-13T10:10:00Z'))
        expect(readPlanLimits('c2')).toMatchObject({ windows: [{ usedPercent: 20 }], plan: 'max', capturedAt: '2026-11-13T10:10:00.000Z', refreshFailedAt: null })
        forgetPlanLimits('c2')
    })

    it('shows a failure with nothing to keep, and clears the bars of an account plan limits no longer apply to', () => {
        recordPlanLimitsReading('c3', PROBE_FAILED)
        expect(readPlanLimits('c3')).toMatchObject({ windows: [], unavailable: { reason: 'probeFailed' } })

        recordPlanLimitsReading('c3', { windows: [session] })
        recordPlanLimitsReading('c3', { windows: [], unavailable: { reason: 'unsupported' } })
        expect(readPlanLimits('c3')).toMatchObject({ windows: [], unavailable: { reason: 'unsupported' } })
        forgetPlanLimits('c3')
    })

    it('orders the windows from the shortest to the month', () => {
        recordPlanLimitsReading('c4', { windows: [{ ...session, id: 'm', kind: 'monthly' }, { ...session, id: 'x', kind: 'model', label: 'Fable' }, session, { ...session, id: 'w', kind: 'weekly' }] })
        expect(readPlanLimits('c4')?.windows.map(w => w.kind)).toEqual(['session', 'weekly', 'model', 'monthly'])
        forgetPlanLimits('c4')
    })

    it('keeps the plan and the extra usage when a run end records its windows alone', () => {
        recordPlanLimitsReading('c5', { windows: [session], plan: 'max', extraUsage: { enabled: true, usedPercent: 12, zeroCap: false } })
        recordPlanLimits('c5', [{ ...session, usedPercent: 50 }])
        expect(readPlanLimits('c5')).toMatchObject({ plan: 'max', extraUsage: { usedPercent: 12 }, windows: [{ usedPercent: 50 }] })
        forgetPlanLimits('c5')
    })
})

describe('plan limit latch', () => {
    const now = Date.parse('2026-11-04T15:00:00Z')

    it('holds the connection until the spent window resets', () => {
        recordPlanLimits('spent', [{ kind: 'session', label: null, usedPercent: 100, resetsAt: '2026-11-04T18:00:00Z' }])
        armPlanLimitLatch('spent', now)
        expect(isPlanLimitLatched('spent', Date.parse('2026-11-04T17:59:00Z'))).toBe(true)
        expect(isPlanLimitLatched('spent', Date.parse('2026-11-04T18:00:00Z'))).toBe(false)
        expect(isPlanLimitLatched('another', now)).toBe(false)
        clearPlanLimitLatch('spent')
        forgetPlanLimits('spent')
    })

    // Claude reads its usage when a run ends well, so a refused run leaves the reading under 100%.
    it('holds for half an hour when no reading says when the limit resets', () => {
        recordPlanLimits('stale', [{ kind: 'session', label: null, usedPercent: 97, resetsAt: '2026-11-04T18:00:00Z' }])
        armPlanLimitLatch('stale', now)
        expect(isPlanLimitLatched('stale', now + 29 * 60_000)).toBe(true)
        expect(isPlanLimitLatched('stale', now + 30 * 60_000)).toBe(false)

        recordPlanLimits('stale', [{ kind: 'session', label: null, usedPercent: 100, resetsAt: '2026-11-04T14:00:00Z' }])
        armPlanLimitLatch('stale', now)
        expect(isPlanLimitLatched('stale', now + 29 * 60_000)).toBe(true)
        forgetPlanLimits('stale')
    })

    // Codex refreshes its windows during the run's teardown, after the refusal armed the hold.
    it('picks up the reset time a reading records after the hold is armed', () => {
        recordPlanLimits('late', [{ kind: 'weekly', label: null, usedPercent: 97, resetsAt: '2026-11-07T15:00:00Z' }])
        armPlanLimitLatch('late', now)
        recordPlanLimits('late', [{ kind: 'weekly', label: null, usedPercent: 100, resetsAt: '2026-11-07T15:00:00Z' }])
        expect(isPlanLimitLatched('late', now + 31 * 60_000)).toBe(true)
        expect(isPlanLimitLatched('late', Date.parse('2026-11-07T14:59:00Z'))).toBe(true)
        expect(isPlanLimitLatched('late', Date.parse('2026-11-07T15:00:00Z'))).toBe(false)
        clearPlanLimitLatch('late')
        forgetPlanLimits('late')
    })

    it('keeps the probe as the floor when a later reading no longer says spent', () => {
        recordPlanLimits('eased', [{ kind: 'session', label: null, usedPercent: 100, resetsAt: '2026-11-04T18:00:00Z' }])
        armPlanLimitLatch('eased', now)
        recordPlanLimits('eased', [{ kind: 'session', label: null, usedPercent: 40, resetsAt: '2026-11-04T18:00:00Z' }])
        expect(isPlanLimitLatched('eased', now + 29 * 60_000)).toBe(true)
        expect(isPlanLimitLatched('eased', now + 30 * 60_000)).toBe(false)
        clearPlanLimitLatch('eased')
        forgetPlanLimits('eased')
    })

    it('lifts the hold when cleared', () => {
        armPlanLimitLatch('cleared', now)
        clearPlanLimitLatch('cleared')
        expect(isPlanLimitLatched('cleared', now)).toBe(false)
    })
})
