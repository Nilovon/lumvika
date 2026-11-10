import { describe, expect, it } from 'vitest'

import { CRITERION_RUBRIC, readScore } from './judge'
import { MAX_IDEAS, selectIdeas } from './select'
import { CRITERIA, type Criterion, type JudgedCandidate, type Lens } from './types'

function judged(name: string, lens: Lens, overrides: Partial<Record<Criterion, number>> = {}, base = 0.9): JudgedCandidate {
    const scores = Object.fromEntries(
        CRITERIA.map(criterion => {
            const score = overrides[criterion] ?? base
            return [criterion, { score, level: Math.round(score * 2), confidence: 0.8 }]
        })
    ) as JudgedCandidate['scores']
    return { name, role: 'Does a job', hook: 'A fact.', lens, evidence: [], steps: [], when: 'Every Monday', connectors: [], missingApps: [], firstRun: 'A report', kickoff: 'Do the job.', scores }
}

describe('readScore', () => {
    it('reads the expected level under the probabilities, on a 0 to 1 scale', () => {
        expect(readScore({ probabilities: { '0': 0, '1': 0.5, '2': 0.5 }, confidence: 0.7 }, 3)).toEqual({ score: 0.75, level: 2, confidence: 0.7 })
        expect(readScore({ probabilities: { '0': 1, '1': 0, '2': 0 } }, 3)).toEqual({ score: 0, level: 0, confidence: 0 })
    })

    it('answers nothing when the endpoint sent no probabilities', () => {
        expect(readScore(undefined, 3)).toBeNull()
        expect(readScore({ score: 2 }, 3)).toBeNull()
        expect(readScore({ probabilities: {} }, 3)).toBeNull()
    })
})

describe('selectIdeas', () => {
    it('rejects a generic idea however well it scores elsewhere, with the level as the reason', () => {
        const { kept, rejected } = selectIdeas([judged('Generic', 'content', { specificity: 0.2 }, 1)])

        expect(kept).toEqual([])
        expect(rejected[0].verdict).toEqual({ keep: false, weakest: 'specificity', reason: CRITERION_RUBRIC.specificity.levels[0] })
    })

    it('ranks by total and keeps two ideas per function at most', () => {
        const { kept, rejected } = selectIdeas([judged('Content C', 'content', {}, 0.7), judged('Content A', 'content', {}, 0.95), judged('Support', 'support', {}, 0.8), judged('Content B', 'content', {}, 0.9)])

        expect(kept.map(idea => idea.name)).toEqual(['Content A', 'Content B', 'Support'])
        expect(rejected.map(idea => idea.name)).toEqual(['Content C'])
        expect(rejected[0].verdict.reason).toContain('already cover content')
    })

    it('stops at the cap', () => {
        const lenses: Lens[] = ['acquisition', 'sales', 'delivery', 'support', 'backoffice', 'watch', 'content']
        const { kept, rejected } = selectIdeas(lenses.map((lens, index) => judged(`Idea ${index}`, lens, {}, 0.95 - index * 0.02)))

        expect(kept).toHaveLength(MAX_IDEAS)
        expect(rejected.map(idea => idea.name)).toEqual(['Idea 5', 'Idea 6'])
    })

    it('lists every idea that holds the floors as eligible, caps aside, best first', () => {
        const { kept, eligible } = selectIdeas([judged('Content C', 'content', {}, 0.7), judged('Content A', 'content', {}, 0.95), judged('Generic', 'sales', { specificity: 0.2 }, 1), judged('Content B', 'content', {}, 0.9)])

        expect(kept.map(idea => idea.name)).toEqual(['Content A', 'Content B'])
        expect(eligible.map(idea => idea.name)).toEqual(['Content A', 'Content B', 'Content C'])
    })
})
