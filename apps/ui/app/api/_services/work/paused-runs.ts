import 'server-only'

import { PAUSED_ON_PERSON_STATUSES } from '@lumvika/contracts'

import { dbOf, type WorkScope } from '@/app/api/_services/work/refs'
import { selectMany } from '@/lib/db'

// A run that stops on a person (`PAUSED_ON_PERSON_STATUSES`) sends no terminal event and leaves the
// engine's live runs, so the hub would otherwise free its issue as stale and start a second run on it
// while the first still waits for the answer. The conversations among `sessionIds` that wait on a
// person right now.
export async function sessionsPausedOnPerson(scope: WorkScope, sessionIds: Iterable<string | null | undefined>): Promise<Set<string>> {
    const ids = [...new Set([...sessionIds].filter((id): id is string => !!id))]
    if (ids.length === 0) return new Set()
    const { data, error } = await selectMany(dbOf(scope), 'sessions', ['id'] as const, { id: ids, status: [...PAUSED_ON_PERSON_STATUSES] })
    if (error) throw new Error(`Failed to read the conversations of the issues: ${error.message}`)
    return new Set((data ?? []).map(session => session.id))
}
