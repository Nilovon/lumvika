'use client'

import type { MemberProfile, WorkAuthor } from '@lumvika/contracts'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { listMemberProfilesAction, listWorkspaceMembersAction } from '@/app/api/_actions/members.actions'
import type { ChannelCoworker } from '@/app/api/_services/work/channels.service'
import { useBoardStore } from '@/stores/board.store'

// Who the channels name: the people of the workspace (read once per tab) and the coworkers, those
// of the board the person sees plus any a channel showed them (a coworker of a Box they do not reach
// still signs its messages).

// `email` tells apart two people who share a name, as the Members dialog does.
export type DirectoryPerson = { id: string; name: string | null; photo: string | null; email: string | null }
export type DirectoryCoworker = { id: string; name: string; handle: string | null; reachable: boolean }

type Person = MemberProfile & { email: string | null }

let peopleCache: Person[] | null = null
let peopleRead: Promise<Person[]> | null = null

async function readPeopleOnce(): Promise<Person[]> {
    const [profiles, members] = await Promise.all([listMemberProfilesAction(), listWorkspaceMembersAction().catch(() => null)])
    const emails = new Map(members?.ok ? members.members.map(member => [member.userId, member.email]) : [])
    return profiles.map(profile => ({ ...profile, email: emails.get(profile.id) ?? null }))
}

function readPeople(): Promise<Person[]> {
    peopleRead ??= readPeopleOnce()
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
    const [people, setPeople] = useState<Person[] | null>(peopleCache)
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

    const directoryPeople = useMemo(() => people?.map(person => ({ id: person.id, name: person.name, photo: person.avatarUrl, email: person.email })) ?? null, [people])
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
