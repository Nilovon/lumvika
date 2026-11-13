'use client'

import { listGoalsAction, type GoalsOverview } from '@/app/api/_actions/goals.actions'
import { useCallback, useEffect, useState } from 'react'

// `overview` is null until the first read lands, which the screen shows as its skeleton.
export function useGoals() {
    const [overview, setOverview] = useState<GoalsOverview | null>(null)
    const [failed, setFailed] = useState(false)

    const apply = useCallback((result: Awaited<ReturnType<typeof listGoalsAction>>) => {
        setFailed(!result.ok)
        if (result.ok) setOverview({ goals: result.goals, teams: result.teams, projects: result.projects })
    }, [])

    const reload = useCallback(() => listGoalsAction().then(apply), [apply])

    useEffect(() => {
        let active = true
        void listGoalsAction().then(result => active && apply(result))
        return () => {
            active = false
        }
    }, [apply])

    return { overview, failed, reload }
}
