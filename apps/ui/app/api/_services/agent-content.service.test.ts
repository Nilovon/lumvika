import type { EngineAgentDetail, EngineSchedule, EngineTrigger } from '@/lib/engine/types'
import { describe, expect, it } from 'vitest'
import { sealAgentDetail, sealSchedule, sealSkill, sealSkillFile, sealTrigger } from './agent-content.service'

const SECRET = 'template author secret'

describe('remaining template content locks', () => {
    it('keeps skill bodies sealed', () => {
        const result = sealSkill({ slug: 'research', name: 'Research', description: '', body: SECRET, files: [] }, true)

        expect(result.locked).toBe(true)
        expect(result.body).not.toContain(SECRET)
    })

    it('keeps skill reference files sealed', () => {
        const result = sealSkillFile({ content: SECRET, truncated: true }, true)

        expect(result.locked).toBe(true)
        expect(result.content).not.toContain(SECRET)
    })

    it('keeps system prompts sealed', () => {
        const result = sealAgentDetail({ soul: SECRET } as EngineAgentDetail, true)

        expect(result.soul).not.toContain(SECRET)
    })

    it('keeps schedule prompts sealed', () => {
        const result = sealSchedule({ body: SECRET } as EngineSchedule, true)

        expect(result.body).not.toContain(SECRET)
    })

    it('keeps trigger prompts sealed', () => {
        const result = sealTrigger({ body: SECRET } as EngineTrigger, true)

        expect(result.body).not.toContain(SECRET)
    })
})
