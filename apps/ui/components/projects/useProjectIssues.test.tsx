// @vitest-environment happy-dom
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    move: vi.fn(),
    get: vi.fn(),
    feed: { onUpdate: null as ((row: Record<string, unknown>) => void) | null },
}))

vi.mock('@/app/api/_actions/issues.actions', () => ({ listProjectIssuesAction: mocks.list, moveIssueAction: mocks.move, getIssueAction: mocks.get, transitionIssueAction: vi.fn(), createIssueAction: vi.fn() }))
vi.mock('@/supabase/useRealtimeSubscription', () => ({ useRealtimeSubscription: (_table: string, options: { onUpdate: (row: Record<string, unknown>) => void }) => void (mocks.feed.onUpdate = options.onUpdate) }))
const errorText = () => 'Refused'
vi.mock('@/hooks/useErrorText', () => ({ useErrorText: () => errorText }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const { useProjectIssues } = await import('./useProjectIssues')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function summary(id: string, status: IssueStatus, position: number): IssueSummary {
    return { id, projectId: 'p1', number: Number(id.slice(1)), ref: `ENG-${id.slice(1)}`, title: id, status, priority: 'none', assignee: null, parentIssueId: null, goalId: null, dueDate: null, position, checkoutRunId: null, checkedOutAt: null, startedAt: null, completedAt: null, createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z' }
}

const TOTALS = { backlog: 0, todo: 2, in_progress: 450, in_review: 0, blocked: 0, done: 0, cancelled: 0 }

let root: Root | null = null
const probe: { current: ReturnType<typeof useProjectIssues> | null } = { current: null }

function Probe() {
    const issues = useProjectIssues('p1', 'ENG')
    useEffect(() => {
        probe.current = issues
    })
    return null
}

async function settle() {
    for (let i = 0; i < 5; i++) await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

beforeEach(async () => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ ok: true, issues: [summary('i1', 'todo', 1024), summary('i2', 'todo', 2048), summary('i3', 'in_progress', 1024)], totals: TOTALS })
    root = createRoot(document.createElement('div'))
    await act(async () => root!.render(createElement(Probe)))
    await settle()
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
})

describe('useProjectIssues', () => {
    it('reads the issue back when the move never reached the server', async () => {
        mocks.move.mockRejectedValue(new Error('network'))
        mocks.get.mockResolvedValue({ ok: true, issue: { ...summary('i1', 'todo', 1024), description: null, blockedReason: null, createdBy: { kind: 'system' }, sessionId: null, subIssues: [] } })
        await act(async () => void (await probe.current!.move(probe.current!.issues![0], 'in_progress', 2048, null)))
        expect(probe.current!.issues!.find(issue => issue.id === 'i1')).toMatchObject({ status: 'todo', position: 1024 })
        expect(probe.current!.totals).toMatchObject({ todo: 2, in_progress: 450 })
    })

    it('knows how many cards a column holds beyond the ones it loaded, and loads more of one column', async () => {
        expect(probe.current!.totals?.in_progress).toBe(450)
        await act(async () => probe.current!.showMore('in_progress'))
        expect(mocks.list).toHaveBeenLastCalledWith('p1', { in_progress: 201 })
    })

    it('asks the server to place a drop at the end, whatever the board loaded', async () => {
        mocks.move.mockResolvedValue({ ok: true, issue: summary('i1', 'in_progress', 451 * 1024) })
        await act(async () => void (await probe.current!.move(probe.current!.issues![0], 'in_progress', 2048, null)))
        expect(mocks.move).toHaveBeenCalledWith('i1', { status: 'in_progress', beforeIssueId: null })
        expect(probe.current!.issues!.find(issue => issue.id === 'i1')).toMatchObject({ status: 'in_progress', position: 451 * 1024 })
        expect(probe.current!.totals).toMatchObject({ todo: 1, in_progress: 451 })
    })

    it('shows what the server holds after a refused drop, not the state from before the drag', async () => {
        let refuse!: () => void
        mocks.move.mockReturnValue(new Promise(resolve => (refuse = () => resolve({ ok: false, code: 'issueChangedMeanwhile', error: 'changed' }))))
        mocks.get.mockResolvedValue({ ok: true, issue: { ...summary('i1', 'blocked', 4096), description: null, blockedReason: 'Anna', createdBy: { kind: 'system' }, sessionId: null, subIssues: [] } })

        let moving!: Promise<boolean>
        await act(async () => void (moving = probe.current!.move(probe.current!.issues![0], 'in_progress', 2048, null)))
        await act(async () => mocks.feed.onUpdate!({ id: 'i1', project_id: 'p1', number: 1, title: 'i1', status: 'blocked', priority: 'none', position: 4096 }))
        expect(probe.current!.issues!.find(issue => issue.id === 'i1')?.status).toBe('in_progress')

        await act(async () => {
            refuse()
            await moving
        })

        expect(mocks.get).toHaveBeenCalledWith('ENG-1')
        expect(probe.current!.issues!.find(issue => issue.id === 'i1')).toMatchObject({ status: 'blocked', position: 4096 })
        expect(probe.current!.issues!.find(issue => issue.id === 'i1')).not.toHaveProperty('blockedReason')
        expect(probe.current!.totals).toMatchObject({ todo: 1, in_progress: 450, blocked: 1 })
    })
})
