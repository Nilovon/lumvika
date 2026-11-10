import { isSetupAnswered } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'
import { DEFAULT_INSTALL_PROMPT } from './install-template'

describe('DEFAULT_INSTALL_PROMPT', () => {
    it('answers the setup question on its own', () => {
        expect(isSetupAnswered({ required: true, prompt: DEFAULT_INSTALL_PROMPT })).toBe(true)
    })

    // A rewrite that drops one of these leaves the buyer with an agent that guesses, asks for
    // secrets in the chat, or never hands the message box back.
    it.each(['ask_user', 'suggest_service', 'memory_write', 'install_complete'])('tells the agent to use %s', tool => {
        expect(DEFAULT_INSTALL_PROMPT).toContain(tool)
    })
})
