import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-skill-index-'))
process.env.RERUN_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { buildSkillIndex } = await import('./index.js')
const { writeSkill } = await import('./loader.js')

describe('buildSkillIndex', () => {
    it('is empty for an agent with no skills', async () => {
        expect(await buildSkillIndex('noskills')).toBe('')
    })

    it('lists every skill and uses the first slug as the /slug example', async () => {
        await writeSkill('indexed', 'Research', 'Looks things up', 'Do research.')
        await writeSkill('indexed', 'Writing', '', 'Write.')

        const index = await buildSkillIndex('indexed')
        expect(index).toContain('for example /research')
        expect(index.endsWith('- Research (slug: research): Looks things up\n- Writing (slug: writing): ')).toBe(true)
        expect(index).not.toContain('Do research.')
    })
})
