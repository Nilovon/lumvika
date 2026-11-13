import type { IssueRunFailure, IssueSummary } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { keepRunFailure, shownRunFailure } from './run-failure'

const failure: IssueRunFailure = { agentId: 'ada', reason: 'no_model', sessionId: 'session-1', runId: 'run-1', at: '2026-11-12T10:00:00.000Z' }

type Shown = Pick<IssueSummary, 'status' | 'assignee' | 'checkoutRunId' | 'runFailure'>
const issue = (overrides: Partial<Shown> = {}): Shown => ({ status: 'todo', assignee: { kind: 'agent', agentId: 'ada' }, checkoutRunId: null, runFailure: failure, ...overrides })

describe('shownRunFailure', () => {
    it('shows the failure of the coworker the issue is assigned to, in todo, in progress or blocked', () => {
        expect(shownRunFailure(issue())).toBe(failure)
        expect(shownRunFailure(issue({ status: 'in_progress' }))).toBe(failure)
        expect(shownRunFailure(issue({ status: 'blocked' }))).toBe(failure)
    })

    it('shows nothing when no failure is the coworker latest event', () => {
        expect(shownRunFailure(issue({ runFailure: null }))).toBeNull()
        expect(shownRunFailure(issue({ runFailure: undefined }))).toBeNull()
    })

    it('shows nothing once the issue went to someone else', () => {
        expect(shownRunFailure(issue({ assignee: { kind: 'agent', agentId: 'bob' } }))).toBeNull()
        expect(shownRunFailure(issue({ assignee: { kind: 'user', userId: 'anna' } }))).toBeNull()
        expect(shownRunFailure(issue({ assignee: null }))).toBeNull()
    })

    it('shows nothing once the issue left the statuses a coworker works in', () => {
        for (const status of ['backlog', 'in_review', 'done', 'cancelled'] as const) expect(shownRunFailure(issue({ status }))).toBeNull()
    })

    it('shows nothing while a run holds the issue', () => {
        expect(shownRunFailure(issue({ checkoutRunId: 'run-2' }))).toBeNull()
    })
})

describe('keepRunFailure', () => {
    it('keeps what the screen knew when the new summary did not read it', () => {
        expect(keepRunFailure({ checkoutRunId: null, runFailure: undefined }, { runFailure: failure }).runFailure).toBe(failure)
    })

    it('takes what the server read when it did', () => {
        expect(keepRunFailure({ checkoutRunId: null, runFailure: null }, { runFailure: failure }).runFailure).toBeNull()
    })

    it('drops the failure once a run took the issue, a newer event of the coworker', () => {
        expect(keepRunFailure({ checkoutRunId: 'run-2', runFailure: undefined }, { runFailure: failure }).runFailure).toBeNull()
    })
})
