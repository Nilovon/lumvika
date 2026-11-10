import { describe, expect, it } from 'vitest'

import { automatedRunOutcome, automatedRunReport, completionStatus, storedKind, type StoredNotification } from './inbound'
import type { NotificationPayload } from '@/lib/engine/types'

const BASE = {
    agentId: 'agt_1',
    sessionId: 'ses_1',
    runId: 'run_1',
    message: 'The draft is ready to review.',
    timestamp: '2026-08-22T11:02:44.000Z',
} as const

const payload = (over: Partial<NotificationPayload>) => ({ event: 'agent.notification', kind: 'info', ...BASE, ...over }) as NotificationPayload
const stored = (over: Partial<StoredNotification>) => ({ event: 'agent.notification', kind: 'info', ...BASE, ...over }) as StoredNotification

describe('storedKind', () => {
    it('rewrites the kind an agent picked itself, which is always just "look at this"', () => {
        expect(storedKind(payload({ kind: 'done' }))).toBe('info')
        expect(storedKind(payload({ kind: 'error' }))).toBe('info')
    })

    it('keeps the kinds the engine derives from the HITL tool the run stopped on', () => {
        expect(storedKind(payload({ kind: 'question' }))).toBe('question')
        expect(storedKind(payload({ kind: 'approval' }))).toBe('approval')
        expect(storedKind(payload({ kind: 'connector' }))).toBe('connector')
    })

    it('leaves a run completion alone, which is the engine reporting, not the agent', () => {
        expect(storedKind(payload({ event: 'agent.message.completed', kind: 'done' }))).toBe('done')
        expect(storedKind(payload({ event: 'agent.schedule.completed', kind: 'error' }))).toBe('error')
    })

    it('drops a progress notification from an engine that has not taken the removal', () => {
        expect(storedKind(payload({ kind: 'progress' } as Partial<NotificationPayload>))).toBeNull()
    })
})

describe('completionStatus', () => {
    it('flags an agent notification as unread whatever kind reached it', () => {
        expect(completionStatus(stored({ kind: 'info' }))).toBe('awaiting_ack')
    })

    it('maps each HITL kind onto its own waiting state', () => {
        expect(completionStatus(stored({ kind: 'question' }))).toBe('awaiting_question')
        expect(completionStatus(stored({ kind: 'approval' }))).toBe('awaiting_approval')
        expect(completionStatus(stored({ kind: 'connector' }))).toBe('awaiting_connector')
    })

    it('unsticks a session on run completion', () => {
        expect(completionStatus(stored({ event: 'agent.message.completed', kind: 'done' }))).toBe('idle')
        expect(completionStatus(stored({ event: 'agent.trigger.completed', kind: 'error' }))).toBe('error')
    })

    it('leaves a session opened by the scheduler alone', () => {
        expect(completionStatus(stored({ event: 'agent.session.created', kind: 'info' }))).toBeNull()
    })
})

describe('automatedRunReport', () => {
    it('hands over the final answer of a finished schedule or trigger', () => {
        expect(automatedRunReport(stored({ event: 'agent.schedule.completed', kind: 'done', metadata: { finalText: ' 4 applications sent ' } }))).toEqual({ failed: false, report: '4 applications sent' })
        expect(automatedRunReport(stored({ event: 'agent.trigger.completed', kind: 'done', metadata: { finalText: 'Reminder sent' } }))).toEqual({ failed: false, report: 'Reminder sent' })
    })

    it('hands over the error of a failed run', () => {
        expect(automatedRunReport(stored({ event: 'agent.schedule.completed', kind: 'error', metadata: { error: 'LinkedIn asked to reconnect', finalText: 'partial' } }))).toEqual({ failed: true, report: 'LinkedIn asked to reconnect' })
    })

    it('has no report from an engine that sent no answer', () => {
        expect(automatedRunReport(stored({ event: 'agent.schedule.completed', kind: 'done', metadata: { status: 'done' } }))).toEqual({ failed: false, report: null })
        expect(automatedRunReport(stored({ event: 'agent.schedule.completed', kind: 'done', metadata: { finalText: '   ' } }))).toEqual({ failed: false, report: null })
    })

    it('leaves chat runs and anything that is not an end alone', () => {
        expect(automatedRunReport(stored({ event: 'agent.message.completed', kind: 'done', metadata: { finalText: 'x' } }))).toBeNull()
        expect(automatedRunReport(stored({ event: 'agent.schedule.completed', kind: 'info' }))).toBeNull()
    })
})

describe('automatedRunOutcome', () => {
    it('names how the run ended', () => {
        expect(automatedRunOutcome(false, false)).toBe('done')
        expect(automatedRunOutcome(false, true)).toBe('nothing')
        expect(automatedRunOutcome(true, true)).toBe('failed')
    })
})
