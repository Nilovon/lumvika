'use client'

import { listTeamsAction } from '@/app/api/_actions/teams.actions'
import type { TeamOverview } from '@/app/api/_services/work/teams.service'
import type { Team } from '@lumvika/contracts'
import { useCallback, useEffect, useState } from 'react'

// `teams` is null until the first read lands, which the screen shows as its skeleton.
export function useTeams() {
    const [teams, setTeams] = useState<TeamOverview[] | null>(null)
    const [failed, setFailed] = useState(false)

    const apply = useCallback((result: Awaited<ReturnType<typeof listTeamsAction>>) => {
        setFailed(!result.ok)
        if (result.ok) setTeams(result.teams)
    }, [])

    const reload = useCallback(() => listTeamsAction().then(apply), [apply])

    useEffect(() => {
        let active = true
        void listTeamsAction().then(result => active && apply(result))
        return () => {
            active = false
        }
    }, [apply])

    // A mutation hands back the team as it now stands: it replaces the old one without a reload.
    const applyTeam = useCallback((team: Team) => {
        setTeams(current => {
            if (!current) return current
            const known = current.some(entry => entry.id === team.id)
            const next = known ? current.map(entry => (entry.id === team.id ? { ...entry, ...team } : entry)) : [...current, { ...team, projects: [] }]
            return next.sort((a, b) => a.name.localeCompare(b.name))
        })
    }, [])

    const dropTeam = useCallback((teamId: string) => setTeams(current => current?.filter(entry => entry.id !== teamId) ?? current), [])

    return { teams, failed, reload, applyTeam, dropTeam }
}
