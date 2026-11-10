import { beforeEach, describe, expect, it } from 'vitest'

import { useDesktopStore } from './desktop.store'

const INITIAL = useDesktopStore.getState()
const TAKEOVER = { agentId: 'a1', callId: 'call-1', url: 'https://example.com/login', reason: 'Sign in' }

beforeEach(() => {
    useDesktopStore.setState(INITIAL, true)
})

describe('desktop', () => {
    it('opens a desktop without a takeover, and a takeover with its request', () => {
        useDesktopStore.getState().openTakeover(TAKEOVER)
        useDesktopStore.getState().openDesktop('a1')
        expect(useDesktopStore.getState()).toMatchObject({ agentId: 'a1', takeover: null })
        useDesktopStore.getState().openTakeover(TAKEOVER)
        expect(useDesktopStore.getState()).toMatchObject({ agentId: 'a1', takeover: TAKEOVER })
    })

    it('ends with the desktop, closed or handed back', () => {
        useDesktopStore.getState().openTakeover(TAKEOVER)
        useDesktopStore.getState().handBack('call-1', { url: null })
        expect(useDesktopStore.getState()).toMatchObject({ agentId: null, takeover: null, handedBack: { 'call-1': { url: null } } })
        useDesktopStore.getState().openDesktop('a1')
        useDesktopStore.getState().close()
        expect(useDesktopStore.getState()).toMatchObject({ agentId: null, takeover: null })
    })
})
