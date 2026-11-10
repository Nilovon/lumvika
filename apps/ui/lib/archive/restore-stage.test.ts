import { describe, expect, it } from 'vitest'
import { restoreStageOf } from './restore-stage'

describe('restoreStageOf', () => {
    it('waits for a machine until the restore has one', () => {
        expect(restoreStageOf(null, false)).toBe('machine')
        expect(restoreStageOf({ status: 'archived', error_message: null }, false)).toBe('machine')
        expect(restoreStageOf({ status: 'restoring', error_message: null }, false)).toBe('machine')
    })

    it('restores the data once the machine is claimed', () => {
        expect(restoreStageOf({ status: 'restoring', error_message: null }, true)).toBe('data')
    })

    it('wakes the agents once the data is back', () => {
        expect(restoreStageOf({ status: 'restored', error_message: null }, true)).toBe('agents')
    })

    it('says so when the restore could not land and will be tried again', () => {
        expect(restoreStageOf({ status: 'archived', error_message: 'Restore failed before a verdict: No machine is available right now' }, false)).toBe('waiting')
    })

    it('leaves a refused canary to a human rather than promising a retry', () => {
        expect(restoreStageOf({ status: 'restored', error_message: 'Restore canary: agents missing' }, true)).toBe('failed')
    })
})
