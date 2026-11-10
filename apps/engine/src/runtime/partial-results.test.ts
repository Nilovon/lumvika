import { describe, expect, it } from 'vitest'
import { partialResultsNote } from './partial-results.js'

describe('partialResultsNote', () => {
    it('lists every finished task under a heading the next turn can quote', () => {
        expect(
            partialResultsNote([
                { label: 'Task 1 — competitors', text: 'four brands found' },
                { label: 'Task 3 — regulation', text: 'vitamin D capped at 100 µg' },
            ])
        ).toBe('Run stopped by the user before the turn finished. Results already obtained by delegated tasks, kept so they are not redone:\n\n## Task 1 — competitors\nfour brands found\n\n## Task 3 — regulation\nvitamin D capped at 100 µg')
    })
})
