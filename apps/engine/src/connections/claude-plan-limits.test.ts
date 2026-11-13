import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-claude-usage-'))

const { afterEach, beforeEach, describe, expect, it, vi } = await import('vitest')

type QueryCall = { prompt: AsyncIterable<unknown>; options: { abortController: AbortController; cwd: string; env: Record<string, string | undefined>; settingSources: string[] } }

// The SDK's side of the probe, as the test poses it: what `get_usage` answers, and every query made.
const sdk = vi.hoisted(() => ({ usage: null as unknown, initFails: false, calls: [] as QueryCall[] }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: (call: QueryCall) => {
        sdk.calls.push(call)
        return {
            initializationResult: async () => {
                if (sdk.initFails) throw new Error('spawn failed')
                return {}
            },
            usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => sdk.usage,
        }
    },
}))

const { claudePlanLimitsStale, probeClaudeUsage, refreshClaudePlanLimits } = await import('./claude-plan-limits.js')
const { forgetPlanLimits, readPlanLimits, recordPlanLimitsReading } = await import('./plan-limits.js')
const { recordCredentialRejected, forgetCredentialRejected } = await import('./credential-rejections.js')

const MAX_USAGE = {
    subscription_type: 'max',
    rate_limits_available: true,
    rate_limits: {
        five_hour: { utilization: 31, resets_at: '2026-11-13T18:00:00Z' },
        seven_day: { utilization: 64, resets_at: '2026-11-18T08:00:00Z' },
        model_scoped: [{ display_name: 'Fable', utilization: 12, resets_at: '2026-11-18T08:00:00Z' }],
        extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 2000, utilization: 40 },
    },
}

function claudeConnection(id: string, env: Record<string, string> = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-token' }) {
    return { id, config: { name: 'Claude', provider: 'claude' as const, models: [], extraModels: [], createdAt: '2026-11-01T00:00:00Z' }, env }
}

beforeEach(() => {
    sdk.usage = MAX_USAGE
    sdk.initFails = false
    sdk.calls = []
})

afterEach(() => {
    vi.useRealTimers()
})

describe('probeClaudeUsage', () => {
    it('reads the usage off a CLI that is never sent a prompt, then stops it', async () => {
        const usage = await probeClaudeUsage(claudeConnection('probe-1', { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-token', CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'refresh' }))
        expect(usage).toEqual(MAX_USAGE)

        const [{ prompt, options }] = sdk.calls
        expect(options.abortController.signal.aborted).toBe(true)
        expect(await prompt[Symbol.asyncIterator]().next()).toEqual({ done: true, value: undefined })
        expect(options.settingSources).toEqual([])
        expect(existsSync(options.cwd)).toBe(false)
    })

    it('hands the CLI the subscription token and nothing of the engine', async () => {
        process.env.LUMVIKA_API_KEY = 'engine-secret'
        try {
            await probeClaudeUsage(claudeConnection('probe-2', { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-token', CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'refresh' }))
        } finally {
            delete process.env.LUMVIKA_API_KEY
        }
        const { env } = sdk.calls[0].options
        expect(env).toMatchObject({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-token', CLAUDE_CODE_OAUTH_SCOPES: 'user:profile user:inference', DISABLE_AUTO_COMPACT: '1' })
        expect(env.ANTHROPIC_API_KEY).toBeUndefined()
        expect(env.LUMVIKA_API_KEY).toBeUndefined()
    })

    // A Claude Code login of the machine's own user must never answer for the connection's token.
    it("keeps the CLI off the machine's own Claude config", async () => {
        await probeClaudeUsage(claudeConnection('probe-config'))
        const { env, cwd } = sdk.calls[0].options
        expect(env.CLAUDE_CONFIG_DIR).toBe(cwd)
    })

    it('answers null when the CLI does not start, and stops it all the same', async () => {
        sdk.initFails = true
        expect(await probeClaudeUsage(claudeConnection('probe-3'))).toBeNull()
        expect(sdk.calls[0].options.abortController.signal.aborted).toBe(true)
    })
})

describe('refreshClaudePlanLimits', () => {
    it('records the windows, the plan and the extra usage', async () => {
        await refreshClaudePlanLimits(claudeConnection('refresh-1'))
        expect(readPlanLimits('refresh-1')).toMatchObject({
            plan: 'max',
            windows: [{ id: 'five_hour' }, { id: 'seven_day' }, { id: 'seven_day_fable', label: 'Fable' }],
            extraUsage: { enabled: true, usedPercent: 40 },
            unavailable: null,
        })
        forgetPlanLimits('refresh-1')
    })

    it('keeps the last good bars when the next probe fails', async () => {
        await refreshClaudePlanLimits(claudeConnection('refresh-2'))
        sdk.initFails = true
        await refreshClaudePlanLimits(claudeConnection('refresh-2'))
        const reading = readPlanLimits('refresh-2')
        expect(reading?.windows).toHaveLength(3)
        expect(reading?.refreshFailedAt).not.toBeNull()
        forgetPlanLimits('refresh-2')
    })

    it('says plan limits do not apply to a token read as inference only', async () => {
        sdk.usage = { subscription_type: null, rate_limits_available: false, rate_limits: null }
        await refreshClaudePlanLimits(claudeConnection('refresh-3'))
        expect(readPlanLimits('refresh-3')?.unavailable).toEqual({ reason: 'unsupported' })
        forgetPlanLimits('refresh-3')
    })

    it('starts one probe for two asks at once', async () => {
        const connection = claudeConnection('refresh-4')
        await Promise.all([refreshClaudePlanLimits(connection), refreshClaudePlanLimits(connection)])
        expect(sdk.calls).toHaveLength(1)
        forgetPlanLimits('refresh-4')
    })

    it('leaves alone a connection with no token, of another provider, or turned away', async () => {
        await refreshClaudePlanLimits(claudeConnection('refresh-5', {}))
        await refreshClaudePlanLimits({ ...claudeConnection('refresh-6'), config: { ...claudeConnection('refresh-6').config, provider: 'codex' } })
        recordCredentialRejected('refresh-7')
        await refreshClaudePlanLimits(claudeConnection('refresh-7'))
        forgetCredentialRejected('refresh-7')
        expect(sdk.calls).toHaveLength(0)
    })
})

describe('claudePlanLimitsStale', () => {
    const now = Date.parse('2026-11-13T12:00:00Z')
    const window = { id: 'five_hour', kind: 'session' as const, label: null, usedPercent: 10, resetsAt: null }

    it('counts a reading a run just left as fresh', () => {
        recordPlanLimitsReading('stale-1', { windows: [window] }, new Date(now - 60_000))
        expect(claudePlanLimitsStale('stale-1', now)).toBe(false)
        expect(claudePlanLimitsStale('stale-1', now + 5 * 60_000)).toBe(true)
        forgetPlanLimits('stale-1')
    })

    it('tries a failed read again sooner, and an unsupported account no sooner than a good one', () => {
        recordPlanLimitsReading('stale-2', { windows: [], unavailable: { reason: 'probeFailed' } }, new Date(now))
        expect(claudePlanLimitsStale('stale-2', now + 60_000)).toBe(false)
        expect(claudePlanLimitsStale('stale-2', now + 2 * 60_000)).toBe(true)

        recordPlanLimitsReading('stale-3', { windows: [], unavailable: { reason: 'unsupported' } }, new Date(now))
        expect(claudePlanLimitsStale('stale-3', now + 4 * 60_000)).toBe(false)
        forgetPlanLimits('stale-2')
        forgetPlanLimits('stale-3')
    })

    it('reads a connection never asked as stale', () => {
        expect(claudePlanLimitsStale('never', now)).toBe(true)
    })
})
