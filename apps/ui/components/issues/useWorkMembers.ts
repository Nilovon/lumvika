'use client'

import { listMemberProfilesAction } from '@/app/api/_actions/members.actions'
import { UNNAMED } from '@/hooks/useMemberProfiles'
import type { IsoAgent } from '@/lib/board/types'
import { useBoardStore } from '@/stores/board.store'
import { useSession } from '@/supabase/session/SessionProvider'
import type { MemberProfile, WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type WorkMemberLabel = { name: string; photo: string | null; kind: 'user' | 'agent' | 'system'; known: boolean }

const peopleCache = new Map<number, MemberProfile[]>()
const peopleReads = new Map<number, Promise<MemberProfile[]>>()

function readPeople(workspaceId: number): Promise<MemberProfile[]> {
    const pending = peopleReads.get(workspaceId)
    if (pending) return pending
    const read = listMemberProfilesAction()
        .then(people => {
            peopleCache.set(workspaceId, people)
            return people
        })
        .catch(() => peopleCache.get(workspaceId) ?? [])
        .finally(() => peopleReads.delete(workspaceId))
    peopleReads.set(workspaceId, read)
    return read
}

// The people of the workspace and its coworkers, as an assignee, a lead or an author is drawn. The
// coworkers are the board's, already hydrated on every page; the people are read once per workspace.
export function useWorkMembers() {
    const t = useTranslations('issues.member')
    const { workspace, user } = useSession()
    const workspaceId = workspace?.id
    const agents = useBoardStore(state => state.agents)
    const [people, setPeople] = useState<MemberProfile[] | null>(() => (workspaceId === undefined ? null : (peopleCache.get(workspaceId) ?? null)))

    useEffect(() => {
        if (workspaceId === undefined) return
        let active = true
        void readPeople(workspaceId).then(next => {
            if (active) setPeople(next)
        })
        return () => {
            active = false
        }
    }, [workspaceId])

    const personById = useMemo(() => new Map((people ?? []).map(person => [person.id, person])), [people])
    const agentById = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents])
    const coworkers = useMemo<IsoAgent[]>(() => agents.filter(agent => !agent.disabledAt), [agents])

    const labelOf = useCallback(
        (member: WorkMemberRef | WorkAuthor | null): WorkMemberLabel | null => {
            if (!member) return null
            if (member.kind === 'system') return { name: t('system'), photo: null, kind: 'system', known: true }
            if (member.kind === 'agent') {
                const agent = agentById.get(member.agentId)
                return { name: agent?.name ?? t('coworker'), photo: null, kind: 'agent', known: !!agent }
            }
            const person = personById.get(member.userId)
            const name = person?.name && person.name !== UNNAMED ? person.name : t('teammate')
            return { name, photo: person?.avatarUrl ?? null, kind: 'user', known: !!person }
        },
        [agentById, personById, t],
    )

    return { people: people ?? [], peopleLoaded: people !== null, coworkers, labelOf, meId: user?.id ?? null }
}
