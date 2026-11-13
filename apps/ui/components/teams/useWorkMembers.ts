'use client'

import { listMemberProfilesAction } from '@/app/api/_actions/members.actions'
import { useBoardStore } from '@/stores/board.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import type { MemberProfile, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type WorkMemberIdentity = { ref: WorkMemberRef; key: string; name: string; photo: string | null; isMe: boolean }

export function memberKey(ref: WorkMemberRef): string {
    return ref.kind === 'user' ? `user:${ref.userId}` : `agent:${ref.agentId}`
}

const peopleCache = new Map<number, MemberProfile[]>()

// The people of the workspace (names and photos live in the auth records, read by the server) and
// its coworkers (the board's own rows), resolved to what a row or an avatar shows.
export function useWorkMembers() {
    const t = useTranslations('teams.member')
    const { workspace, user } = useSession()
    const workspaceId = workspace?.id
    const [people, setPeople] = useState<MemberProfile[] | null>(() => (workspaceId === undefined ? null : (peopleCache.get(workspaceId) ?? null)))
    const agents = useBoardStore(state => state.agents)

    useEffect(() => {
        if (workspaceId === undefined) return
        let active = true
        void listMemberProfilesAction()
            .then(list => {
                peopleCache.set(workspaceId, list)
                if (active) setPeople(list)
            })
            .catch(() => {
                if (active) setPeople(current => current ?? [])
            })
        return () => {
            active = false
        }
    }, [workspaceId])

    const coworkers = useMemo(() => [...agents].sort((a, b) => a.name.localeCompare(b.name)).map(agent => ({ id: agent.id, name: agent.name })), [agents])
    const personById = useMemo(() => new Map((people ?? []).map(person => [person.id, person])), [people])
    const coworkerById = useMemo(() => new Map(coworkers.map(coworker => [coworker.id, coworker])), [coworkers])
    const meId = user?.id ?? null

    const identify = useCallback(
        (ref: WorkMemberRef): WorkMemberIdentity => {
            if (ref.kind === 'agent') return { ref, key: memberKey(ref), name: coworkerById.get(ref.agentId)?.name ?? t('unknownCoworker'), photo: null, isMe: false }
            const person = personById.get(ref.userId)
            return { ref, key: memberKey(ref), name: person?.name ?? t('unknownPerson'), photo: person?.avatarUrl ?? null, isMe: ref.userId === meId }
        },
        [coworkerById, personById, meId, t]
    )

    const allPeople = useMemo(() => (people ?? []).map(person => identify({ kind: 'user', userId: person.id })), [people, identify])
    const allCoworkers = useMemo(() => coworkers.map(coworker => identify({ kind: 'agent', agentId: coworker.id })), [coworkers, identify])

    return { identify, people: allPeople, coworkers: allCoworkers, peopleLoaded: people !== null, meId }
}
