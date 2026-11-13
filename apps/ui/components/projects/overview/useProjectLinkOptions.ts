'use client'

import { listGoalsAction } from '@/app/api/_actions/goals.actions'
import type { GoalTreeNode } from '@/lib/work/goal-tree'
import { useEffect, useState } from 'react'

export type LinkOption = { id: string; label: string; depth: number }
export type ProjectLinkOptions = { teams: LinkOption[]; goals: LinkOption[] } | 'failed' | null

function flatten(nodes: readonly GoalTreeNode[], depth = 0): LinkOption[] {
    return nodes.flatMap(node => [{ id: node.id, label: node.title, depth }, ...flatten(node.children, depth + 1)])
}

// The teams and goals a project can be linked to, read once with the goals screen's own action.
export function useProjectLinkOptions(): ProjectLinkOptions {
    const [options, setOptions] = useState<ProjectLinkOptions>(null)
    useEffect(() => {
        let cancelled = false
        void listGoalsAction()
            .then(result => {
                if (cancelled) return
                setOptions(result.ok ? { teams: result.teams.map(team => ({ id: team.id, label: team.name, depth: 0 })), goals: flatten(result.goals) } : 'failed')
            })
            .catch(() => !cancelled && setOptions('failed'))
        return () => {
            cancelled = true
        }
    }, [])
    return options
}
