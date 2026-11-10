import { describe, expect, it } from 'vitest'
import { copyOf, duplicateAgentName } from './copy-name'

describe('copyOf', () => {
    it('appends the suffix when there is room', () => {
        expect(copyOf('Research Assistant', 60)).toBe('Research Assistant copy')
    })

    it('trims what it is given rather than suffixing whitespace', () => {
        expect(copyOf('  Scout  ', 60)).toBe('Scout copy')
    })

    // The result has to stay valid, so the suffix is reserved inside the cap rather than added past
    // it: a name that already fills the width would otherwise produce something the form rejects.
    it('keeps the result inside the cap', () => {
        expect(copyOf('a'.repeat(80), 20).length).toBeLessThanOrEqual(20)
    })

    // Cutting mid-word reads as a typo. A whole-word base is kept whenever one survives past the
    // halfway mark; below that there is no base left worth keeping and the hard cut wins.
    it('cuts on a word boundary when one is left', () => {
        expect(copyOf('Quarterly revenue reporter', 20)).toBe('Quarterly copy')
        expect(copyOf('Quarterlyrevenuereporter', 20)).toBe('Quarterlyrevenu copy')
    })

    // Duplicating a duplicate is the ordinary case, and the name must not grow without bound.
    it('stays inside the cap when a copy is copied again', () => {
        let name = 'Inbox triage'
        for (let i = 0; i < 10; i++) name = duplicateAgentName(name)
        expect(name.length).toBeLessThanOrEqual(60)
        expect(name.endsWith(' copy')).toBe(true)
    })
})
