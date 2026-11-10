import { describe, expect, it } from 'vitest'

import { describeNeed, readNeeds, revisedJob } from './needs'
import type { ForemanProfile } from './phase'

describe('readNeeds', () => {
    it('keeps a job with its pain and how they cope today', () => {
        expect(readNeeds([{ job: ' Finding users ', pain: "Don't know where they hang out", today: 'Not at all' }])).toEqual([{ job: 'Finding users', pain: "Don't know where they hang out", today: 'Not at all' }])
    })

    it('drops an entry missing its job or its pain rather than writing it half empty', () => {
        expect(readNeeds([{ job: 'Finding users' }, { pain: 'No time' }, { job: 'Content', pain: ' ' }, null, 'Finding users'])).toEqual([])
    })

    it('answers on what the argument really is', () => {
        expect(readNeeds(undefined)).toEqual([])
        expect(readNeeds({ job: 'Finding users', pain: 'No time' })).toEqual([])
    })
})

describe('describeNeed', () => {
    it('reads as one line, with today only when they said it', () => {
        expect(describeNeed({ job: 'Finding users', pain: 'No time for outreach', today: 'By hand' })).toBe('Finding users: No time for outreach (today: By hand)')
        expect(describeNeed({ job: 'Finding users', pain: 'No time for outreach' })).toBe('Finding users: No time for outreach')
    })
})

describe('revisedJob', () => {
    const interview: ForemanProfile = { useCases: ['Trouver de nouveaux clients'], pain: 'Trouver de nouveaux clients', needs: [{ job: 'Trouver de nouveaux clients', pain: 'Je ne sais pas où trouver les décideurs' }] }
    const agent = { kind: 'agent' as const, name: 'Hiring Leads', role: 'Finds potential apprenticeship hiring managers and delivers leads for review' }
    const asked = 'Je cherche un worker capable de trouver des décisionnaires capables de me recruter en alternance'

    it('leaves the interview alone when the card came back confirmed as it was drawn', () => {
        expect(revisedJob(interview, { ...agent, need: 'Je ne sais pas où trouver les décideurs' })).toBeNull()
        expect(revisedJob(interview, { kind: 'template', slug: 'buyer-signals' })).toBeNull()
        expect(revisedJob(interview, undefined)).toBeNull()
    })

    it('leaves the interview alone when the change kept its pain, a new name or a detail', () => {
        expect(revisedJob(interview, { ...agent, need: ' je ne sais pas où trouver les décideurs ', asked: 'Call it Prospector' })).toBeNull()
    })

    it('makes the coworker they agreed on the job once the card changed it', () => {
        expect(revisedJob(interview, { ...agent, need: asked, asked })).toEqual({ useCases: [agent.role], pain: agent.role, needs: [{ job: agent.role, pain: asked }] })
    })

    it('drops the pain of the job they turned away from when the new card carries none', () => {
        expect(revisedJob(interview, { ...agent, asked })).toEqual({ useCases: [agent.role], pain: agent.role, needs: [] })
        expect(revisedJob(interview, { ...agent, need: agent.role, asked })).toEqual({ useCases: [agent.role], pain: agent.role, needs: [] })
    })
})
