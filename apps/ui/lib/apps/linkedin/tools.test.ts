import { describe, expect, it } from 'vitest'
import { missingRequired, toolParams } from '@/lib/apps/tools'
import { LINKEDIN_TOOLS, linkedinTool } from './tools'

describe('the LinkedIn tool set', () => {
    it('never hands the coworker a login, a deletion or a webhook', () => {
        const actions = LINKEDIN_TOOLS.map(tool => tool.action)
        expect(actions).not.toContain('login')
        expect(actions.some(action => /delete|webhook/.test(action))).toBe(false)
        expect(new Set(LINKEDIN_TOOLS.map(tool => tool.name)).size).toBe(LINKEDIN_TOOLS.length)
    })

    it('meters every action LinkedIn could restrict the account for', () => {
        for (const name of ['send_invitation', 'send_message', 'get_profile', 'search_people', 'comment_on_post']) {
            expect(linkedinTool(name)?.quota).toBeDefined()
        }
    })
})

describe('toolParams', () => {
    it('drops what the tool does not declare and caps the page size', () => {
        const search = linkedinTool('search_people')!
        expect(toolParams(search, { title: 'CEO', count: 500, account_id: 'someone-else' })).toEqual({ title: 'CEO', count: 50 })
        expect(toolParams(search, { title: 'CEO' })).toEqual({ title: 'CEO', count: 10 })
    })

    it('reports what a call is missing', () => {
        const invite = linkedinTool('send_invitation')!
        expect(missingRequired(invite, toolParams(invite, { message: 'Hi' }))).toEqual(['profile_url'])
    })
})
