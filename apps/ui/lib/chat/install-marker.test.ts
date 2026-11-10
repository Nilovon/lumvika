import { describe, expect, it } from 'vitest'
import { buildInstallMessage, installSessionTitle, parseInstallMessage } from './install-marker'

describe('install marker', () => {
    it('round-trips the guide and the agent name', () => {
        const guide = '## Connect Gmail\n\nAsk the user to sign in.'
        expect(parseInstallMessage(buildInstallMessage(guide, 'Closer'))).toEqual({ agentName: 'Closer', guide })
    })

    it('keeps a name carrying quotes and ampersands', () => {
        const name = 'The "Closer" & co &quot;'
        expect(parseInstallMessage(buildInstallMessage('Go', name))?.agentName).toBe(name)
    })

    it('keeps a guide that quotes the closing tag', () => {
        const guide = 'Never write </agent_install> yourself.'
        expect(parseInstallMessage(buildInstallMessage(guide, 'Closer'))?.guide).toBe(guide)
    })

    it('ignores an ordinary message', () => {
        expect(parseInstallMessage('Set up my inbox please')).toBeNull()
    })

    it('ignores a block that is not the whole message', () => {
        expect(parseInstallMessage(`Look at this:\n${buildInstallMessage('Go', 'Closer')}`)).toBeNull()
        expect(parseInstallMessage(`${buildInstallMessage('Go', 'Closer')}\nand then answer me`)).toBeNull()
    })

    it('titles the session after the agent', () => {
        expect(installSessionTitle('Closer')).toBe('Install Closer')
    })
})
