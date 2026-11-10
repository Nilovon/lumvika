import type { Database } from '@/app/api/database.types'

import { isScheduledSource } from './prefs'

export type UnseenRun = Database['public']['Functions']['unseen_runs']['Returns'][number]

// One line of the inbox and of the board card. Every run of the same scheduled task is folded into
// one line: an hourly task left alone for a day is « ×24 », not twenty-four lines.
export type UnseenGroup = {
    key: string
    agentId: string
    source: UnseenRun['source']
    slug: string | null
    title: string
    message: string
    sessionIds: string[]
    latestSessionId: string
    count: number
    at: number
}

export function groupKeyOf(run: Pick<UnseenRun, 'session_id' | 'agent_id' | 'source' | 'slug'>): string {
    return isScheduledSource(run.source) && run.slug ? `${run.agent_id}:${run.source}:${run.slug}` : run.session_id
}

// Newest first, like the rows the function returns.
export function groupUnseenRuns(runs: UnseenRun[]): UnseenGroup[] {
    const groups = new Map<string, UnseenGroup>()
    for (const run of runs) {
        const key = groupKeyOf(run)
        const at = new Date(run.last_at).getTime()
        const group = groups.get(key)
        if (!group) {
            groups.set(key, { key, agentId: run.agent_id, source: run.source, slug: run.slug, title: run.title, message: run.message, sessionIds: [run.session_id], latestSessionId: run.session_id, count: run.run_count, at })
            continue
        }
        group.sessionIds.push(run.session_id)
        group.count += run.run_count
        if (at > group.at) Object.assign(group, { at, title: run.title, message: run.message, latestSessionId: run.session_id })
    }
    return [...groups.values()].sort((a, b) => b.at - a.at)
}

export const unseenCount = (runs: UnseenRun[]) => runs.reduce((sum, run) => sum + run.run_count, 0)

// A row the user marked seen in this tab stays hidden even if a fetch that started before the write
// brings it back. Only a run that finished after that moment shows it again.
export function withoutSeenLocally(runs: UnseenRun[], seenLocally: Record<string, number>): UnseenRun[] {
    return runs.filter(run => {
        const seenAt = seenLocally[run.session_id]
        return seenAt === undefined || new Date(run.last_at).getTime() > seenAt
    })
}
