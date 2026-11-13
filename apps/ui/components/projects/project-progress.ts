import type { IssueCounts } from '@lumvika/contracts'

// Cancelled issues left the work: they count neither as done nor as left to do.
export function projectProgress(counts: IssueCounts): { done: number; total: number; open: number; percent: number } {
    const done = counts.done ?? 0
    const total = Object.entries(counts).reduce((sum, [status, count]) => (status === 'cancelled' ? sum : sum + (count ?? 0)), 0)
    return { done, total, open: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}
