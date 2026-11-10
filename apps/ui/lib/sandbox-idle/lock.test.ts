import { describe, expect, it } from 'vitest'
import { isSandboxLocked, reactivationStateOf, type LockArchive } from './lock'

function archive(overrides: Partial<LockArchive> = {}): LockArchive {
    return { reason: 'inactivity', status: 'archived', reactivation_requested_at: null, reactivation_approved_at: null, reactivation_rejected_at: null, ...overrides }
}

describe('isSandboxLocked', () => {
    it('locks a sandbox archived for inactivity', () => {
        expect(isSandboxLocked(archive())).toBe(true)
    })

    it('stays locked through a request and a refusal', () => {
        expect(isSandboxLocked(archive({ reactivation_requested_at: '2026-10-01T00:00:00Z' }))).toBe(true)
        expect(isSandboxLocked(archive({ reactivation_requested_at: '2026-10-01T00:00:00Z', reactivation_rejected_at: '2026-10-02T00:00:00Z' }))).toBe(true)
    })

    it('opens on an approval, and on a restore an admin ran by hand', () => {
        expect(isSandboxLocked(archive({ reactivation_approved_at: '2026-10-02T00:00:00Z' }))).toBe(false)
        expect(isSandboxLocked(archive({ status: 'restored' }))).toBe(false)
    })

    it('never locks on an archive taken for another reason, or on none at all', () => {
        expect(isSandboxLocked(archive({ reason: 'manual' }))).toBe(false)
        expect(isSandboxLocked(archive({ reason: 'access_ended' }))).toBe(false)
        expect(isSandboxLocked(null)).toBe(false)
    })
})

describe('reactivationStateOf', () => {
    it('reads the latest word on a request', () => {
        expect(reactivationStateOf(archive())).toBe('none')
        expect(reactivationStateOf(archive({ reactivation_requested_at: '2026-10-01T00:00:00Z' }))).toBe('requested')
        expect(reactivationStateOf(archive({ reactivation_requested_at: '2026-10-01T00:00:00Z', reactivation_rejected_at: '2026-10-02T00:00:00Z' }))).toBe('rejected')
        expect(reactivationStateOf(archive({ reactivation_requested_at: '2026-10-01T00:00:00Z', reactivation_approved_at: '2026-10-02T00:00:00Z' }))).toBe('approved')
    })
})
