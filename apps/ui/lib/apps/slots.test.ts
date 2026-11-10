import { describe, expect, it } from 'vitest'
import { canRemoveSlot, connectAllowance, connectionsToPause, heldSlots, type ConnectState } from './slots'

const PAID: ConnectState = { workspaceTrialing: false, stripeSlots: 0, liveConnections: 0, subscriberTrialOpen: false, subscriberTrialAvailable: true }

describe('heldSlots', () => {
    it('lands an increase at once and holds a decrease until the period advances', () => {
        expect(heldSlots(1, 3, false)).toBe(3)
        expect(heldSlots(3, 1, false)).toBe(3)
        expect(heldSlots(3, 1, true)).toBe(1)
        expect(heldSlots(null, 2, false)).toBe(2)
    })
})

describe('connectAllowance', () => {
    it('fills an empty paid slot first', () => {
        expect(connectAllowance({ ...PAID, stripeSlots: 2, liveConnections: 1 })).toBe('free_slot')
    })

    it('offers the subscriber trial on the first slot only, once', () => {
        expect(connectAllowance(PAID)).toBe('subscriber_trial')
        expect(connectAllowance({ ...PAID, subscriberTrialAvailable: false })).toBe('buy_slot')
        expect(connectAllowance({ ...PAID, stripeSlots: 1, liveConnections: 1 })).toBe('buy_slot')
    })

    it('counts the open trial as a slot while it runs', () => {
        expect(connectAllowance({ ...PAID, subscriberTrialOpen: true, liveConnections: 1, subscriberTrialAvailable: false })).toBe('buy_slot')
        expect(connectAllowance({ ...PAID, subscriberTrialOpen: true, stripeSlots: 1, liveConnections: 1, subscriberTrialAvailable: false })).toBe('free_slot')
    })

    it('puts one slot on the workspace trial, and no more', () => {
        const trialing = { ...PAID, workspaceTrialing: true, subscriberTrialAvailable: false }
        expect(connectAllowance(trialing)).toBe('workspace_trial_slot')
        expect(connectAllowance({ ...trialing, stripeSlots: 1, liveConnections: 1 })).toBe('buy_slot')
        expect(connectAllowance({ ...trialing, liveConnections: 1 })).toBe('buy_slot')
    })
})

describe('connectionsToPause', () => {
    const connections = [
        { id: 'oldest', created_at: '2026-10-01T00:00:00Z' },
        { id: 'newest', created_at: '2026-10-10T00:00:00Z' },
        { id: 'middle', created_at: '2026-10-05T00:00:00Z' },
    ]

    it('pauses the most recent connections past what is paid', () => {
        expect(connectionsToPause(connections, 1)).toEqual(['newest', 'middle'])
        expect(connectionsToPause(connections, 3)).toEqual([])
        expect(connectionsToPause(connections, 0)).toHaveLength(3)
    })
})

describe('canRemoveSlot', () => {
    it('only gives back a slot nothing fills', () => {
        expect(canRemoveSlot(2, 1)).toBe(true)
        expect(canRemoveSlot(2, 2)).toBe(false)
        expect(canRemoveSlot(0, 0)).toBe(false)
    })
})
