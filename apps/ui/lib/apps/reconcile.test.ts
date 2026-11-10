import { describe, expect, it } from 'vitest'
import { accountsToDelete, type ConnectionRef } from './reconcile'

const NOW = new Date('2026-10-14T12:00:00Z')
const HOURS_AGO = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

const NS = 'prod'
const PLATFORMS = ['linkedin', 'whatsapp']

function account(id: string, createdHoursAgo = 48) {
    return { account_id: id, platform: 'linkedin', account_name: `${NS}:row-${id}`, created_at: HOURS_AGO(createdHoursAgo) }
}

function connection(accountId: string, status: string, updatedHoursAgo = 1, pauseReason: string | null = null): ConnectionRef {
    return { id: `row-${accountId}`, provider_account_id: accountId, status, pause_reason: pauseReason, updated_at: HOURS_AGO(updatedHoursAgo) }
}

describe('accountsToDelete', () => {
    it('keeps what is connected and what is resting after a LinkedIn limit', () => {
        expect(accountsToDelete([account('a'), account('b')], [connection('a', 'connected'), connection('b', 'paused', 30, 'rate_limited')], NOW, NS, PLATFORMS)).toEqual([])
    })

    it('deletes an account no row claims, once it is past the time a connection takes', () => {
        expect(accountsToDelete([account('young', 0.5), account('old', 2)], [], NOW, NS, PLATFORMS).map(verdict => verdict.accountId)).toEqual(['old'])
    })

    it('deletes what a frozen or signed-out row still holds at Linkup', () => {
        expect(accountsToDelete([account('a')], [connection('a', 'needs_reconnect')], NOW, NS, PLATFORMS)).toEqual([{ accountId: 'a', connectionId: 'row-a', reason: 'not_connected' }])
    })

    it('ignores a deleted row, so its account reads as an orphan', () => {
        expect(accountsToDelete([account('a')], [connection('a', 'deleted')], NOW, NS, PLATFORMS)[0]?.reason).toBe('orphan')
    })

    it('gives an unpaid pause a week and an abandoned connection an hour', () => {
        expect(accountsToDelete([account('a')], [connection('a', 'paused', 24, 'slots')], NOW, NS, PLATFORMS)).toEqual([])
        expect(accountsToDelete([account('a')], [connection('a', 'paused', 24 * 8, 'trial_payment_failed')], NOW, NS, PLATFORMS)[0]?.reason).toBe('unpaid_pause')
        expect(accountsToDelete([account('a')], [connection('a', 'connecting', 0.5)], NOW, NS, PLATFORMS)).toEqual([])
        expect(accountsToDelete([account('a')], [connection('a', 'connecting', 3)], NOW, NS, PLATFORMS)[0]?.reason).toBe('stale_connect')
    })

    it('judges a WhatsApp number like a LinkedIn profile', () => {
        expect(accountsToDelete([{ ...account('wa'), platform: 'whatsapp' }], [], NOW, NS, PLATFORMS)[0]?.reason).toBe('orphan')
    })

    it('leaves the other platforms and the other environments alone', () => {
        expect(accountsToDelete([{ account_id: 'w', platform: 'email', account_name: `${NS}:x`, created_at: HOURS_AGO(100) }], [], NOW, NS, PLATFORMS)).toEqual([])
        expect(accountsToDelete([{ ...account('staging'), account_name: 'staging:row-1' }, { ...account('manual'), account_name: 'jane@acme.com' }], [], NOW, NS, PLATFORMS)).toEqual([])
    })
})
