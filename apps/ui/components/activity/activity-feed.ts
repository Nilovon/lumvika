import type { ActivityEvent } from '@lumvika/contracts'

import type { ActivityRefs } from '@/app/api/_services/work/activity-feed.service'

export const NO_REFS: ActivityRefs = { issues: {}, projects: {}, goals: {}, teams: {}, channels: {} }

export function mergeRefs(a: ActivityRefs, b: ActivityRefs): ActivityRefs {
    return {
        issues: { ...a.issues, ...b.issues },
        projects: { ...a.projects, ...b.projects },
        goals: { ...a.goals, ...b.goals },
        teams: { ...a.teams, ...b.teams },
        channels: { ...a.channels, ...b.channels },
    }
}

// Every event once, newest first: a page read again (or a live event that arrived meanwhile) never
// shows twice.
export function mergeEvents(current: readonly ActivityEvent[], incoming: readonly ActivityEvent[]): ActivityEvent[] {
    const byId = new Map<string, ActivityEvent>()
    for (const event of [...current, ...incoming]) byId.set(event.id, event)
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

export type ActivityDay = { day: string; events: ActivityEvent[] }

// Consecutive events of the same local day, in the order they come.
export function groupByDay(events: readonly ActivityEvent[], dayOf: (iso: string) => string): ActivityDay[] {
    const days: ActivityDay[] = []
    for (const event of events) {
        const day = dayOf(event.createdAt)
        const last = days[days.length - 1]
        if (last && last.day === day) last.events.push(event)
        else days.push({ day, events: [event] })
    }
    return days
}
