import { CRITERION_RUBRIC } from './judge'
import { CRITERIA, type AgentIdea, type Criterion, type JudgedCandidate, type Lens, type Selection } from './types'

export const MAX_IDEAS = 5
const PER_LENS_CAP = 2

// Specificity leads: an idea that fits any company is the one thing this pipeline exists to prevent.
const WEIGHTS: Record<Criterion, number> = { specificity: 0.3, evidence: 0.25, feasibility: 0.2, value: 0.15, novelty: 0.1 }

// Under its floor on any criterion an idea is out whatever its total. A score of 0.5 is the middle
// level of a rubric, and the judge's answer to the same question drifts by about 0.08 between two
// calls, so a floor sits clear of a level rather than on it.
//
// Specificity is cut lower than the rest: a company we know little about only yields jobs specific
// to its trade, which are still worth proposing, and the weights already rank them under the ones
// specific to the company. What the floor turns down is the card any business could be handed.
const FLOORS: Record<Criterion, number> = { specificity: 0.3, evidence: 0.4, feasibility: 0.5, value: 0.4, novelty: 0.5 }

export function totalScore(scores: JudgedCandidate['scores']): number {
    return CRITERIA.reduce((sum, criterion) => sum + scores[criterion].score * WEIGHTS[criterion], 0)
}

// The criterion furthest under its floor, or the lowest one when every floor holds.
function weakestCriterion(scores: JudgedCandidate['scores']): Criterion {
    return [...CRITERIA].sort((a, b) => scores[a].score - FLOORS[a] - (scores[b].score - FLOORS[b]))[0]
}

export function selectIdeas(judged: JudgedCandidate[]): Selection {
    const ranked = judged.map(candidate => ({ candidate, total: totalScore(candidate.scores) })).sort((a, b) => b.total - a.total)

    const perLens = new Map<Lens, number>()
    const kept: AgentIdea[] = []
    const rejected: AgentIdea[] = []
    const eligible: AgentIdea[] = []

    for (const { candidate, total } of ranked) {
        const weakest = weakestCriterion(candidate.scores)
        const reject = (reason: string) => rejected.push({ ...candidate, total, verdict: { keep: false, weakest, reason } })

        if (candidate.scores[weakest].score < FLOORS[weakest]) {
            // The level it fell short of, not the one its score rounds to: just under a floor still
            // rounds up, and "specific to the trade" is no reason to turn an idea down.
            const levels = CRITERION_RUBRIC[weakest].levels
            reject(levels[Math.floor(candidate.scores[weakest].score * (levels.length - 1))])
            continue
        }
        eligible.push({ ...candidate, total, verdict: { keep: true, weakest, reason: CRITERION_RUBRIC[weakest].levels[candidate.scores[weakest].level] } })
        if (kept.length >= MAX_IDEAS) {
            reject(`Passes every floor, outranked by ${MAX_IDEAS} stronger ideas.`)
            continue
        }
        const inLens = perLens.get(candidate.lens) ?? 0
        if (inLens >= PER_LENS_CAP) {
            reject(`Passes every floor, but ${PER_LENS_CAP} stronger ideas already cover ${candidate.lens}.`)
            continue
        }
        perLens.set(candidate.lens, inLens + 1)
        kept.push({ ...candidate, total, verdict: { keep: true, weakest, reason: CRITERION_RUBRIC[weakest].levels[candidate.scores[weakest].level] } })
    }

    return { kept, rejected, eligible }
}
