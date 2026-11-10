import { describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '@/test/supabase-fake'
import { isPhoneStepPending } from './phone-gate.service'

vi.mock('server-only', () => ({}))

const pendingFor = (result: { data?: unknown; error?: unknown }) => isPhoneStepPending(fakeSupabase(table => (table === 'user_phones' ? result : undefined)).client, 'user-1')

describe('isPhoneStepPending', () => {
    it('owes nothing without a row', async () => {
        expect(await pendingFor({ data: null })).toBe(false)
    })

    it('owes nothing once the number is verified', async () => {
        expect(await pendingFor({ data: { verified_at: '2026-10-09T00:00:00Z' } })).toBe(false)
    })

    it('owes nothing once the step is skipped', async () => {
        expect(await pendingFor({ data: { verified_at: null, skipped_at: '2026-10-19T00:00:00Z' } })).toBe(false)
    })

    it('owes a number while the row is neither verified nor skipped', async () => {
        expect(await pendingFor({ data: { verified_at: null, skipped_at: null } })).toBe(true)
    })

    it('leaves the app open when the read fails', async () => {
        expect(await pendingFor({ data: null, error: { message: 'down' } })).toBe(false)
    })
})
