'use client'

import type { OnboardingAnswers } from '@/app/actions/onboarding'
import type { ViewerSignals } from '@/lib/templates/library-view'
import { workTypeTemplateCategory } from '@/lib/onboarding/work-types'
import { useSession } from '@/supabase/session/SessionProvider'
import { useMemo } from 'react'

// What the workspace's profile says about its viewer, which ranks the library's "For you" picks.
// Two fallbacks behind the industry read off the company website: the work type the survey asked
// before it, and the `sector` its three-question version stored before that.
export function useLibraryViewerSignals(): Required<ViewerSignals> {
    const { workspaceAnswers } = useSession()
    return useMemo(() => {
        const answers = workspaceAnswers as OnboardingAnswers | null
        return {
            category: answers?.industry ?? workTypeTemplateCategory(answers?.work_type) ?? answers?.sector ?? null,
            connectorSlugs: answers?.skipped ? [] : (answers?.tools ?? []),
        }
    }, [workspaceAnswers])
}
