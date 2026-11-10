import { describe, expect, it } from 'vitest'
import { appTransition, targetAppStatus } from './status'

describe('targetAppStatus', () => {
    it('follows the box', () => {
        expect(targetAppStatus({ boxes_archived_at: null, boxes_deleted_at: null })).toBe('active')
        expect(targetAppStatus({ boxes_archived_at: '2026-10-14T00:00:00Z', boxes_deleted_at: null })).toBe('frozen')
        expect(targetAppStatus({ boxes_archived_at: null, boxes_deleted_at: '2026-10-14T00:00:00Z' })).toBe('uninstalled')
        expect(targetAppStatus({ boxes_archived_at: '2026-10-14T00:00:00Z', boxes_deleted_at: '2026-10-14T00:00:00Z' })).toBe('uninstalled')
    })
})

describe('appTransition', () => {
    it('freezes, resumes and uninstalls', () => {
        expect(appTransition('active', 'frozen')).toBe('freeze')
        expect(appTransition('frozen', 'active')).toBe('resume')
        expect(appTransition('frozen', 'uninstalled')).toBe('uninstall')
        expect(appTransition('active', 'uninstalled')).toBe('uninstall')
    })

    it('does nothing twice', () => {
        expect(appTransition('frozen', 'frozen')).toBeNull()
        expect(appTransition('uninstalled', 'uninstalled')).toBeNull()
    })

    it('lets an uninstalled app come back without hooks, its accounts are already gone', () => {
        expect(appTransition('uninstalled', 'active')).toBeNull()
        expect(appTransition('uninstalled', 'frozen')).toBeNull()
    })
})
