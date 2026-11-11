'use client'

import { industryFromAnswers } from '@/lib/onboarding/box-name'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { useMemo } from 'react'

// The line of business the workspace's onboarding read off the company website. The answers already
// ride on the session, so this costs no fetch. The ladder behind it lives in `industryFromAnswers`,
// which the server reads the same answers through.
export function useOnboardingIndustry(): string | null {
    const { workspaceAnswers: answers } = useSession()

    return useMemo(() => industryFromAnswers(answers), [answers])
}
