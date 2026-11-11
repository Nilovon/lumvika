'use client'

import { useEffect, useState } from 'react'

import { loadAgentIdeasAction } from '@/app/api/_actions/agent-ideas.actions'
import { useSession } from '@/lib/auth/session/SessionProvider'
import type { StoredAgentIdeas, StoredIdea } from './stored'

// One read per workspace and page load, shared by the board and the dialog. A run still in flight is
// not kept: the next reader asks again, which is how the ideas show up without a reload.
const settled = new Map<number, StoredIdea[]>()
const loading = new Map<number, Promise<StoredAgentIdeas | null>>()

const NO_IDEAS: StoredIdea[] = []

function loadIdeas(workspaceId: number): Promise<StoredIdea[]> {
    let pending = loading.get(workspaceId)
    if (!pending) {
        pending = loadAgentIdeasAction().finally(() => loading.delete(workspaceId))
        loading.set(workspaceId, pending)
    }
    return pending.then(row => {
        if (row?.status === 'running') return NO_IDEAS
        const ideas = row?.ideas ?? NO_IDEAS
        settled.set(workspaceId, ideas)
        return ideas
    })
}

// The agents imagined for this company, best first. Empty until they land, and it stays empty when
// there are none or the read fails: every reader has a list of its own to fall back on. `refreshKey`
// changing asks again while the run has not settled, the dialog passes its open state.
export function useAgentIdeas(refreshKey: unknown = null): StoredIdea[] {
    const workspaceId = useSession().workspace?.id ?? null
    const [loaded, setLoaded] = useState<{ workspaceId: number; ideas: StoredIdea[] } | null>(null)

    useEffect(() => {
        if (workspaceId === null || settled.has(workspaceId)) return
        let active = true
        loadIdeas(workspaceId).then(
            ideas => {
                if (active) setLoaded({ workspaceId, ideas })
            },
            () => {}
        )
        return () => {
            active = false
        }
    }, [workspaceId, refreshKey])

    if (workspaceId === null) return NO_IDEAS
    return settled.get(workspaceId) ?? (loaded?.workspaceId === workspaceId ? loaded.ideas : NO_IDEAS)
}
