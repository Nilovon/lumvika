import { describe, expect, it } from 'vitest'
import { trialStep } from './trials'

const NOW = new Date('2026-10-14T12:00:00Z')
const DAYS_FROM_NOW = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

describe('trialStep', () => {
    it('reminds two days before the end, once', () => {
        expect(trialStep({ trial_ends_at: DAYS_FROM_NOW(1.5), trial_settled_at: null, trial_reminder_sent_at: null }, NOW)).toBe('remind')
        expect(trialStep({ trial_ends_at: DAYS_FROM_NOW(1.5), trial_settled_at: null, trial_reminder_sent_at: NOW.toISOString() }, NOW)).toBeNull()
        expect(trialStep({ trial_ends_at: DAYS_FROM_NOW(5), trial_settled_at: null, trial_reminder_sent_at: null }, NOW)).toBeNull()
    })

    it('converts once the trial is over, reminded or not, and never twice', () => {
        expect(trialStep({ trial_ends_at: DAYS_FROM_NOW(-0.1), trial_settled_at: null, trial_reminder_sent_at: null }, NOW)).toBe('convert')
        expect(trialStep({ trial_ends_at: DAYS_FROM_NOW(-1), trial_settled_at: NOW.toISOString(), trial_reminder_sent_at: null }, NOW)).toBeNull()
        expect(trialStep({ trial_ends_at: null, trial_settled_at: null, trial_reminder_sent_at: null }, NOW)).toBeNull()
    })
})
