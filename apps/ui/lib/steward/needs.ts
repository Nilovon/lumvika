import { asString } from '@/lib/mcp/args'
import type { StewardNeed, StewardPlanItem, StewardProfile } from './phase'

// A need without its job cannot be handed to an agent, and one without its pain is only the job
// again: both are dropped rather than written half empty.
export function readNeeds(raw: unknown): StewardNeed[] {
    if (!Array.isArray(raw)) return []
    return raw.flatMap(entry => {
        const value = (entry ?? {}) as Record<string, unknown>
        const job = asString(value.job)?.trim()
        const pain = asString(value.pain)?.trim()
        if (!job || !pain) return []
        const today = asString(value.today)?.trim()
        return [today ? { job, pain, today } : { job, pain }]
    })
}

export function describeNeed({ job, pain, today }: StewardNeed): string {
    return `${job}: ${pain}${today ? ` (today: ${today})` : ''}`
}

export type RevisedJob = Pick<StewardProfile, 'useCases' | 'pain' | 'needs'>

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// The plan card was sent back and confirmed on another job than the one the interview picked: the
// coworker they agreed on becomes the job, or every later reader of the profile (the steward on the
// engine, the first SOUL, the brain, the agent ideas) goes back to the job they corrected away from.
// A card that kept the interview's pain only had its name or a detail changed, and the interview's
// own words stay the better ones.
export function revisedJob(steward: StewardProfile, item: StewardPlanItem | undefined): RevisedJob | null {
    if (item?.kind !== 'agent' || !item.asked) return null
    const need = item.need?.trim()
    if (need && (steward.needs ?? []).some(interview => sameWords(interview.pain, need))) return null
    return { useCases: [item.role], pain: item.role, needs: need && !sameWords(need, item.role) ? [{ job: item.role, pain: need }] : [] }
}
