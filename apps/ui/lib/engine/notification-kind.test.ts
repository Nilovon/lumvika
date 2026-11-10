import { describe, expect, it } from 'vitest'

import { notificationKindSchema, notificationPayloadSchema } from './types'

const PAYLOAD = {
    event: 'agent.notification',
    agentId: 'agt_1',
    sessionId: 'ses_1',
    message: 'Three payments failed last night.',
    timestamp: '2026-08-18T14:00:00.000Z',
}

describe('notificationKindSchema', () => {
    it('reads an alert from an engine that has not taken the merge yet as an info', () => {
        expect(notificationKindSchema.parse('alert')).toBe('info')
    })

    it('leaves every live kind alone', () => {
        for (const kind of ['info', 'question', 'approval', 'connector', 'done', 'error']) {
            expect(notificationKindSchema.parse(kind)).toBe(kind)
        }
    })

    it('no longer knows the retired progress kind', () => {
        expect(notificationKindSchema.safeParse('progress').success).toBe(false)
    })

    it('still rejects a kind that never existed', () => {
        expect(notificationKindSchema.safeParse('urgent').success).toBe(false)
    })

    it('coerces inside a full payload, so the stale fleet keeps delivering', () => {
        const parsed = notificationPayloadSchema.parse({ ...PAYLOAD, kind: 'alert' })
        expect(parsed.kind).toBe('info')
    })

    it('still accepts a progress payload, so an engine that has not taken the removal gets a 202', () => {
        expect(notificationPayloadSchema.parse({ ...PAYLOAD, kind: 'progress' }).kind).toBe('progress')
    })
})

describe('notificationPayloadSchema origin', () => {
    it('carries the calling agent of a session opened by call_agent', () => {
        const parsed = notificationPayloadSchema.parse({ ...PAYLOAD, event: 'agent.session.created', kind: 'info', source: 'agent', originAgentId: 'agt_caller' })
        expect(parsed.originAgentId).toBe('agt_caller')
        expect(parsed.source).toBe('agent')
    })

    it('accepts a payload from an engine that has not taken the field yet', () => {
        const parsed = notificationPayloadSchema.parse({ ...PAYLOAD, kind: 'question' })
        expect(parsed.originAgentId).toBeUndefined()
    })
})
