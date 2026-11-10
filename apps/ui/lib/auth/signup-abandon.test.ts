import { describe, expect, it, vi } from 'vitest'
import { abandonTrigger, createLeaveWatcher, signupStep } from './signup-abandon'

describe('abandonTrigger', () => {
    it('counts the tab going to the background before any code is sent', () => {
        expect(abandonTrigger('hidden', 'phone')).toBe('tab_hidden')
        expect(abandonTrigger('hidden', 'email')).toBe('tab_hidden')
    })

    it('ignores the tab going to the background while a code is out', () => {
        expect(abandonTrigger('hidden', 'phone_code')).toBeNull()
        expect(abandonTrigger('hidden', 'email_code')).toBeNull()
    })

    it('counts leaving the page at every step', () => {
        for (const step of ['phone', 'phone_code', 'email', 'email_code'] as const) expect(abandonTrigger('pagehide', step)).toBe('page_left')
    })

    it('counts closing the dialog at every step', () => {
        for (const step of ['phone', 'phone_code', 'email', 'email_code'] as const) expect(abandonTrigger('dismissed', step)).toBe('dismissed')
    })
})

describe('signupStep', () => {
    it('names the step after the method and whether its code is out', () => {
        expect(signupStep('phone')).toBe('phone')
        expect(signupStep('phone', true)).toBe('phone_code')
        expect(signupStep('email')).toBe('email')
        expect(signupStep('email', true)).toBe('email_code')
    })
})

describe('createLeaveWatcher', () => {
    it('reads a tab going to the background on its own as hidden', () => {
        const leave = vi.fn()
        createLeaveWatcher(leave).hidden()
        expect(leave).toHaveBeenCalledWith('hidden')
    })

    it('reads the hidden step of a page unload as leaving the page', () => {
        const leave = vi.fn()
        const watcher = createLeaveWatcher(leave)
        watcher.beforeUnload()
        watcher.hidden()
        expect(leave).toHaveBeenCalledWith('pagehide')
    })

    it('spends the unload flag on the first hidden', () => {
        const leave = vi.fn()
        const watcher = createLeaveWatcher(leave)
        watcher.beforeUnload()
        watcher.hidden()
        watcher.hidden()
        expect(leave.mock.calls).toEqual([['pagehide'], ['hidden']])
    })

    it('drops the unload flag once the page shows again', () => {
        const leave = vi.fn()
        const watcher = createLeaveWatcher(leave)
        watcher.beforeUnload()
        watcher.visible()
        watcher.hidden()
        expect(leave).toHaveBeenCalledWith('hidden')
    })

    it('reads pagehide as leaving the page', () => {
        const leave = vi.fn()
        createLeaveWatcher(leave).pageHide()
        expect(leave).toHaveBeenCalledWith('pagehide')
    })
})
