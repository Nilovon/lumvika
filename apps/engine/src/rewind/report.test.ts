import { describe, expect, it } from 'vitest'
import { buildAgentReport, connectorOfTool, pickOutputRuns, type RewindReportInput, type RewindRunRow } from './report.js'

const FROM = '2026-09-07T00:00:00.000Z'
const TO = '2026-09-14T00:00:00.000Z'

function run(partial: Partial<RewindRunRow> & { id: string }): RewindRunRow {
    return {
        sessionId: `s-${partial.id}`,
        status: 'done',
        triggerSource: 'chat',
        model: 'claude-sonnet-5',
        totalTokens: 100,
        costMicros: null,
        startedAt: '2026-09-07T10:00:00.000Z',
        finishedAt: '2026-09-07T10:01:00.000Z',
        ...partial,
    }
}

function input(partial: Partial<RewindReportInput>): RewindReportInput {
    return {
        from: FROM,
        to: TO,
        runs: [],
        tools: [],
        mcpServerNames: [],
        connectorSlugs: new Map(),
        sessionTitles: new Map(),
        sessions: 0,
        calledBy: [],
        memoriesCreated: 0,
        topRecalledMemory: null,
        outputs: [],
        ...partial,
    }
}

describe('connectorOfTool', () => {
    const servers = ['google', 'google-drive', 'rerun']

    it('reads both the native and the CLI naming', () => {
        expect(connectorOfTool('google-drive_search', servers)).toBe('google-drive')
        expect(connectorOfTool('mcp__google-drive__search', servers)).toBe('google-drive')
        expect(connectorOfTool('google_gmail_send', servers)).toBe('google')
    })

    it('never counts a builtin or the rerun bridge as a connector', () => {
        expect(connectorOfTool('web_search', servers)).toBeNull()
        expect(connectorOfTool('mcp__rerun__notify_user', servers)).toBeNull()
    })
})

describe('buildAgentReport', () => {
    it('buckets runs by hour from the start of the week and sums what they did', () => {
        const report = buildAgentReport(
            input({
                runs: [
                    run({ id: 'a', costMicros: 500 }),
                    run({ id: 'b', status: 'error', startedAt: '2026-09-13T23:30:00.000Z', finishedAt: '2026-09-13T23:30:10.000Z' }),
                    run({ id: 'c', status: 'running', finishedAt: null }),
                ],
            })
        )

        expect(report.runs).toEqual({ total: 3, done: 1, error: 1, cancelled: 0 })
        expect(report.hourly[10]).toBe(2)
        expect(report.hourly[167]).toBe(1)
        expect(report.workedMs).toBe(70_000)
        expect(report.costMicros).toBe(500)
        expect(report.tokens).toBe(300)
    })

    it('keeps the cost unknown when no run reported one', () => {
        expect(buildAgentReport(input({ runs: [run({ id: 'a' })] })).costMicros).toBeNull()
    })

    it('names the longest finished run after its conversation', () => {
        const report = buildAgentReport(
            input({
                runs: [run({ id: 'short' }), run({ id: 'long', finishedAt: '2026-09-07T10:30:00.000Z' })],
                sessionTitles: new Map([['s-long', 'Quarterly report']]),
            })
        )

        expect(report.longestRun).toMatchObject({ runId: 'long', durationMs: 30 * 60_000, title: 'Quarterly report' })
    })

    it('splits tool calls between connectors, named by catalog slug, and builtin tools', () => {
        const report = buildAgentReport(
            input({
                mcpServerNames: ['notion', 'gmail-oauth'],
                connectorSlugs: new Map([['gmail-oauth', 'gmail']]),
                tools: [
                    { toolName: 'notion_search', calls: 4, errors: 1 },
                    { toolName: 'mcp__notion__create_page', calls: 2, errors: 0 },
                    { toolName: 'mcp__rerun__web_search', calls: 3, errors: 0 },
                    { toolName: 'web_search', calls: 1, errors: 0 },
                    { toolName: 'gmail-oauth_send', calls: 2, errors: 0 },
                ],
            })
        )

        expect(report.connectors).toEqual([{ name: 'notion', count: 6 }, { name: 'gmail', count: 2 }])
        expect(report.tools).toEqual({ total: 12, errors: 1, top: [{ name: 'web_search', count: 4 }] })
    })
})

describe('pickOutputRuns', () => {
    it('prefers what the agent did on its own, then the longest work', () => {
        const picked = pickOutputRuns(
            [
                run({ id: 'chat-long', finishedAt: '2026-09-07T11:00:00.000Z' }),
                run({ id: 'scheduled', triggerSource: 'schedule' }),
                run({ id: 'failed', status: 'error', triggerSource: 'schedule' }),
            ],
            2
        )

        expect(picked.map(r => r.id)).toEqual(['scheduled', 'chat-long'])
    })
})
