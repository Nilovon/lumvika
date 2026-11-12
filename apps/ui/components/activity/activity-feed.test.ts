import type { ActivityEvent } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { localDayKey } from '@/lib/work/throughput'
import { groupByDay, mergeEvents, mergeRefs, NO_REFS } from './activity-feed'

function event(id: string, createdAt: string): ActivityEvent {
    return { id, projectId: null, issueId: null, entityType: 'project', entityId: 'p', action: 'project.updated', actor: { kind: 'system' }, metadata: {}, createdAt }
}

describe('the activity feed', () => {
    it('merges a live event and a page read again without doubles, newest first', () => {
        const merged = mergeEvents([event('b', '2026-11-12T10:00:00.000Z'), event('a', '2026-11-11T10:00:00.000Z')], [event('c', '2026-11-12T11:00:00.000Z'), event('b', '2026-11-12T10:00:00.000Z')])
        expect(merged.map(item => item.id)).toEqual(['c', 'b', 'a'])
    })

    it('groups the events by local day', () => {
        const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
        const days = groupByDay([event('c', at(12, 9)), event('b', at(12, 1)), event('a', at(10, 22))], iso => localDayKey(new Date(iso)))
        expect(days.map(day => [day.day, day.events.map(item => item.id)])).toEqual([
            ['2026-11-12', ['c', 'b']],
            ['2026-11-10', ['a']],
        ])
    })

    it('adds the names of a new page to the ones already known', () => {
        const refs = mergeRefs({ ...NO_REFS, goals: { g1: { title: 'Grow' } } }, { ...NO_REFS, goals: { g2: { title: 'Ship' } } })
        expect(Object.keys(refs.goals)).toEqual(['g1', 'g2'])
    })
})
