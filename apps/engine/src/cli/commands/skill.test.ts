import { vi } from 'vitest'

const state = vi.hoisted(() => ({ skills: [] as { slug: string; name: string }[], asked: [] as string[] }))

vi.mock('../../skills/loader.js', () => ({
    listSkills: async (id: string) => {
        state.asked.push(id)
        return state.skills
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { skillCommand } = await import('./skill.js')

let out = ''

beforeEach(() => {
    state.skills = []
    state.asked = []
    out = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
        out += String(chunk)
        return true
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('rerun skill list', () => {
    it('prints each skill slug and name', async () => {
        state.skills = [
            { slug: 'research', name: 'Research' },
            { slug: 'writing', name: 'Writing' },
        ]
        await skillCommand(['list', 'agent1'])
        expect(state.asked).toEqual(['agent1'])
        expect(out).toBe('research\tResearch\nwriting\tWriting\n')
    })

    it('asks for the agent id', async () => {
        await expect(skillCommand(['list'])).rejects.toThrow('Usage: rerun skill list <agentId>')
    })

    it('prints the usage for anything else', async () => {
        await expect(skillCommand([])).rejects.toThrow('Usage: rerun skill <list>')
        await expect(skillCommand(['delete', 'agent1'])).rejects.toThrow('Usage: rerun skill <list>')
    })
})
