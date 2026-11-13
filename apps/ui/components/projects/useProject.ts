'use client'

import { getProjectAction } from '@/app/api/_actions/projects.actions'
import { useErrorText } from '@/hooks/useErrorText'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'
import type { ProjectDetail } from '@lumvika/contracts'
import { useCallback, useEffect, useState } from 'react'

export type ProjectState = { status: 'loading' } | { status: 'missing'; message: string } | { status: 'ready'; project: ProjectDetail }

// One project by its key, read again whenever its row changes (someone renamed, archived or
// restricted it from another tab).
export function useProject(projectKey: string) {
    const errorText = useErrorText()
    const [state, setState] = useState<ProjectState>({ status: 'loading' })

    const reload = useCallback(async () => {
        const result = await getProjectAction(projectKey)
        if (!result.ok) {
            setState(current => (current.status === 'ready' && result.code !== 'projectNotFound' ? current : { status: 'missing', message: errorText(result) }))
            return
        }
        setState({ status: 'ready', project: result.project })
    }, [projectKey, errorText])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void reload()
    }, [reload])

    const projectId = state.status === 'ready' ? state.project.id : null

    useRealtimeSubscription('projects', {
        channelId: `project-${projectId}`,
        enabled: !!projectId,
        filter: projectId ? { column: 'id', value: projectId } : undefined,
        onUpdate: () => void reload(),
    })

    return { state, reload }
}
