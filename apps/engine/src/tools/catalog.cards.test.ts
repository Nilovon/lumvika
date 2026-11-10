import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-catalog-'))

const { describe, expect, it } = await import('vitest')
const { toolCatalog } = await import('./catalog.js')

// The catalog builds every family with a stub context to introspect it, so a builtin that touched
// the disk or the logger at build time would take GET /tools down with it.
describe('tool catalog', () => {
    it('introspects the cards family', () => {
        const cards = toolCatalog().find(f => f.family === 'cards')
        expect(cards?.tools.map(t => t.name).sort()).toEqual(['card_file', 'card_table', 'table_view_delete', 'table_view_save'])
    })
})
