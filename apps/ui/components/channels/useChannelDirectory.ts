'use client'

import type { MemberProfile, WorkAuthor } from '@lumvika/contracts'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { listMemberProfilesAction } from '@/app/api/_actions/members.actions'
import type { ChannelCoworker } from '@/app/api/_services/work/channels.service'
import { useBoardStore } from '@/stores/board.store'

// Who the channels name: the people of the workspace (read once per tab) and the coworkers, those
// of the board the person sees plus any a channel showed them (a coworker of a Box they do not reach
// still signs its messages).

export type DirectoryPerson = { id: string; name: string | null; photo: string | null }
export type DirectoryCoworker = { id: string; name: string; handle: string | null; reachable: boolean }

let peopleCache: MemberProfile[] | null = null
let peopleRead: Promise<MemberProfile[]> | null = null

function readPeople(): Promise<MemberProfile[]> {
    peopleRead ??= listMemberProfilesAction()
        .then(people => (peopleCache = people))
        .catch(() => peopleCache ?? [])
        .finally(() => (peopleRead = null))
    return peopleRead
}

const seenCoworkers = new Map<string, ChannelCoworker>()
const listeners = new Set<() => void>()
let seenVersion = 0

export function rememberCoworkers(coworkers: readonly ChannelCoworker[]): void {
    let changed = false
    for (const coworker of coworkers) {
        const known = seenCoworkers.get(coworker.id)
        if (known?.name === coworker.name && known.handle === coworker.handle) continue
        seenCoworkers.set(coworker.id, coworker)
        changed = true
    }
    if (!changed) return
    seenVersion++
    for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export type ChannelDirectory = {
    people: DirectoryPerson[] | null
    coworkers: DirectoryCoworker[]
    person: (userId: string) => DirectoryPerson | null
    coworker: (agentId: string) => DirectoryCoworker | null
    // The name to show for an author, or null while it is still unknown.
    nameOf: (author: WorkAuthor) => string | null
}

export function useChannelDirectory(): ChannelDirectory {
    const [people, setPeople] = useState<MemberProfile[] | null>(peopleCache)
    const boardAgents = useBoardStore(state => state.agents)
    const version = useSyncExternalStore(subscribe, () => seenVersion, () => 0)

    useEffect(() => {
        let active = true
        void readPeople().then(next => {
            if (active) setPeople(next)
        })
        return () => {
            active = false
        }
    }, [])

    const directoryPeople = useMemo(() => people?.map(person => ({ id: person.id, name: person.name, photo: person.avatarUrl })) ?? null, [people])
    const peopleById = useMemo(() => new Map((directoryPeople ?? []).map(person => [person.id, person])), [directoryPeople])

    const coworkers = useMemo(() => {
        const byId = new Map<string, DirectoryCoworker>()
        for (const coworker of seenCoworkers.values()) byId.set(coworker.id, { ...coworker, reachable: false })
        for (const agent of boardAgents) byId.set(agent.id, { id: agent.id, name: agent.name, handle: agent.handle, reachable: true })
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
        // `version` is what tells this memo the module map changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardAgents, version])
    const coworkersById = useMemo(() => new Map(coworkers.map(coworker => [coworker.id, coworker])), [coworkers])

    const person = useCallback((userId: string) => peopleById.get(userId) ?? null, [peopleById])
    const coworker = useCallback((agentId: string) => coworkersById.get(agentId) ?? null, [coworkersById])
    const nameOf = useCallback(
        (author: WorkAuthor) => {
            if (author.kind === 'user') return peopleById.get(author.userId)?.name ?? null
            if (author.kind === 'agent') return coworkersById.get(author.agentId)?.name ?? null
            return null
        },
        [peopleById, coworkersById]
    )

    return { people: directoryPeople, coworkers, person, coworker, nameOf }
}
