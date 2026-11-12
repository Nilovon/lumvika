import 'server-only'

import type { SessionStatus } from '@lumvika/contracts'

import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { selectMany } from '@/supabase/supabase-helpers'

// The statuses in which a coworker's conversation stopped on a person (a question, an approval, a
// connector, a hand-over) and goes on in the same conversation once they answer. A run that ends this
// way sends no terminal event and leaves the engine's live runs, so the hub would otherwise free its
// issue as stale and start a second run on it while the first still waits. `error` and `awaiting_ack`
// are left out: an error ends the run (its checkout is released by the webhook), and a heads-up does
// not stop it.
export const PAUSED_ON_PERSON_STATUSES = ['waiting_human', 'awaiting_question', 'awaiting_approval', 'awaiting_connector'] as const satisfies readonly SessionStatus[]

// The conversations among `sessionIds` that wait on a person right now.
export async function sessionsPausedOnPerson(scope: WorkScope, sessionIds: Iterable<string | null | undefined>): Promise<Set<string>> {
    const ids = [...new Set([...sessionIds].filter((id): id is string => !!id))]
    if (ids.length === 0) return new Set()
    const { data, error } = await selectMany(clientOf(scope), 'sessions', ['id'] as const, { id: ids, status: [...PAUSED_ON_PERSON_STATUSES] })
    if (error) throw new Error(`Failed to read the conversations of the issues: ${error.message}`)
    return new Set((data ?? []).map(session => session.id))
}
