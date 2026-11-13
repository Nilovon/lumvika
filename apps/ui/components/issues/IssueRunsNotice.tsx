'use client'

import { issueRunsReadinessAction } from '@/app/api/_actions/issue-runs.actions'
import type { IssueRunsReadiness } from '@/app/api/_services/work/issue-runs-readiness.service'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// Shared by every surface that assigns a coworker for a minute, so a server updated meanwhile is seen
// without a reload; a failed or unanswered ask is retried on the next one.
const READINESS_TTL_MS = 60_000
let asked: { at: number; answer: Promise<IssueRunsReadiness | null> } | null = null

function askReadiness(): Promise<IssueRunsReadiness | null> {
    if (asked && Date.now() - asked.at < READINESS_TTL_MS) return asked.answer
    const answer = issueRunsReadinessAction()
        .then(result => (result.ok ? result.readiness : null))
        .catch(() => null)
        .then(readiness => {
            if (readiness === null || readiness === 'unreachable') asked = null
            return readiness
        })
    asked = { at: Date.now(), answer }
    return answer
}

export function useIssueRunsReadiness(enabled: boolean): IssueRunsReadiness | null {
    const [readiness, setReadiness] = useState<IssueRunsReadiness | null>(null)
    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        void askReadiness().then(found => !cancelled && setReadiness(found))
        return () => {
            cancelled = true
        }
    }, [enabled])
    return enabled ? readiness : null
}

const MESSAGE_KEY = { outdated: 'outdated', unreachable: 'unreachable', no_engine: 'noEngine' } as const

// Shown where a person assigns a coworker, when the workspace's server cannot run it on the issue.
// The assignment itself is never blocked: it holds, and the coworker starts once the server can.
export function IssueRunsNotice({ coworkerAssigned, className }: { coworkerAssigned: boolean; className?: string }) {
    const t = useTranslations('issues.engine')
    const readiness = useIssueRunsReadiness(coworkerAssigned)
    if (!coworkerAssigned || !readiness || readiness === 'ready') return null
    return (
        <Alert variant="warning" className={cn('py-2', className)}>
            <AlertDescription className="text-xs">{t(MESSAGE_KEY[readiness])}</AlertDescription>
        </Alert>
    )
}
