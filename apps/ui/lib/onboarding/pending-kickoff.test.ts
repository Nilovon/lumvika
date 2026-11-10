import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingKickoff, readPendingKickoff, readPendingKickoffs, savePendingKickoff } from './pending-kickoff'

const KEY = 'rerun:pending-kickoffs'
const LEGACY_KEY = 'rerun:pending-kickoff'

function memoryStorage() {
    const values = new Map<string, string>()
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
        removeItem: vi.fn((key: string) => void values.delete(key)),
    }
}

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('pending kickoff', () => {
    it('round-trips a parked entry until it is cleared', () => {
        savePendingKickoff({ agentId: 'a1', kickoff: 'Brief' })
        expect(readPendingKickoff('a1')).toEqual({ agentId: 'a1', kickoff: 'Brief' })
        clearPendingKickoff('a1')
        expect(readPendingKickoff('a1')).toBeNull()
        expect(storage.getItem(KEY)).toBeNull()
    })

    it('keeps the entry of a coworker created right after another one', () => {
        savePendingKickoff({ agentId: 'gig', kickoff: 'You are Gig Applier' })
        savePendingKickoff({ agentId: 'tracker', kickoff: 'You are Tracker' })
        expect(readPendingKickoffs()).toEqual([
            { agentId: 'gig', kickoff: 'You are Gig Applier' },
            { agentId: 'tracker', kickoff: 'You are Tracker' },
        ])
        clearPendingKickoff('gig')
        expect(readPendingKickoffs()).toEqual([{ agentId: 'tracker', kickoff: 'You are Tracker' }])
    })

    it('replaces the entry of the same agent', () => {
        savePendingKickoff({ agentId: 'a1', kickoff: 'First' })
        savePendingKickoff({ agentId: 'a1', description: 'Second' })
        expect(readPendingKickoffs()).toEqual([{ agentId: 'a1', description: 'Second' }])
    })

    it('carries over an entry parked under the single slot of earlier versions', () => {
        storage.setItem(LEGACY_KEY, JSON.stringify({ agentId: 'old', kickoff: 'Brief' }))
        savePendingKickoff({ agentId: 'new', description: 'Use case' })
        expect(readPendingKickoffs()).toEqual([
            { agentId: 'old', kickoff: 'Brief' },
            { agentId: 'new', description: 'Use case' },
        ])
        expect(storage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('refuses to park an entry without an agent', () => {
        savePendingKickoff({ agentId: '' })
        expect(storage.setItem).not.toHaveBeenCalled()
    })

    it('purges entries that no longer match the shape', () => {
        storage.setItem(KEY, JSON.stringify({ a1: { kickoff: 42 } }))
        expect(readPendingKickoffs()).toEqual([])
        expect(storage.removeItem).toHaveBeenCalledWith(KEY)
    })

    it('reads unparsable JSON as nothing', () => {
        storage.setItem(KEY, '{broken')
        storage.setItem(LEGACY_KEY, '{broken')
        expect(readPendingKickoffs()).toEqual([])
    })

    it('does nothing when there is no storage at all, as during SSR', () => {
        vi.stubGlobal('localStorage', undefined)
        expect(() => savePendingKickoff({ agentId: 'a1' })).not.toThrow()
        expect(readPendingKickoffs()).toEqual([])
        expect(readPendingKickoff('a1')).toBeNull()
        expect(() => clearPendingKickoff('a1')).not.toThrow()
    })
})
