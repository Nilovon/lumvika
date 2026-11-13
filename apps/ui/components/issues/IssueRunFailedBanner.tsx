'use client'

import { retryIssueRunAction } from '@/app/api/_actions/issue-runs.actions'
import { useOpenIssueConversation } from '@/components/issues/IssueWorkingBanner'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { Button } from '@/components/ui/button'
import { useErrorText } from '@/hooks/useErrorText'
import { MessageSquareIcon, RefreshCwIcon } from '@/lib/icons'
import type { IssueRunFailure, IssueSummary } from '@lumvika/contracts'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { NameSkeleton } from '@/components/issues/NameSkeleton'

// The coworker's last run on the issue failed and nothing happened on it since: the person sees it
// here rather than believing the coworker is on it, reads why, and can open that run's conversation
// or wake the coworker again. `onRetried` hides it once a new run started.
export function IssueRunFailedBanner({ issue, failure, onRetried }: { issue: Pick<IssueSummary, 'id' | 'assignee'>; failure: IssueRunFailure; onRetried: () => void }) {
    const t = useTranslations('issues.detail')
    const errorText = useErrorText()
    const { labelOf } = useWorkMembers()
    const openConversation = useOpenIssueConversation()
    const [retrying, setRetrying] = useState(false)
    const assignee = labelOf(issue.assignee)
    const name = assignee?.name ?? ''

    const retry = async () => {
        setRetrying(true)
        try {
            const result = await retryIssueRunAction(issue.id)
            if (!result.ok) {
                toast.error(errorText(result))
                return
            }
            if (!result.outcome.started) {
                toast.error(t('retryRefused', { name, refusal: result.outcome.refusal }))
                return
            }
            toast.success(t('retryStarted', { name }))
            onRetried()
        } finally {
            setRetrying(false)
        }
    }

    return (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AgentBuddy agentId={failure.agentId} size={28} mood="error" facing="right" className="shrink-0" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col">
                {assignee?.loading ? <NameSkeleton className="my-1 h-3.5 w-48 max-w-full" /> : <span className="text-sm font-medium">{t('runFailedTitle', { name })}</span>}
                <span className="text-xs text-muted-foreground">{t('runFailedReason', { reason: failure.reason })}</span>
            </div>
            <div className="flex flex-wrap gap-2 max-sm:w-full">
                {failure.sessionId && (
                    <Button type="button" size="sm" variant="outline" onClick={() => openConversation(failure.agentId, failure.sessionId as string)} className="max-sm:flex-1">
                        <MessageSquareIcon />
                        {t('openConversation')}
                    </Button>
                )}
                <Button type="button" size="sm" onClick={() => void retry()} disabled={retrying} className="max-sm:flex-1">
                    <RefreshCwIcon className={retrying ? 'animate-spin' : undefined} />
                    {t('retry')}
                </Button>
            </div>
        </div>
    )
}
