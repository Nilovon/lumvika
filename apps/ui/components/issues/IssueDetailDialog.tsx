'use client'

import { BlockedReasonDialog } from '@/components/issues/BlockedReasonDialog'
import { IssueActivity } from '@/components/issues/IssueActivity'
import { IssueComments } from '@/components/issues/IssueComments'
import { IssueDescriptionEditor } from '@/components/issues/IssueDescriptionEditor'
import { IssueDetailSkeleton } from '@/components/issues/IssueDetailSkeleton'
import { IssueProperties } from '@/components/issues/IssueProperties'
import { IssueRunFailedBanner } from '@/components/issues/IssueRunFailedBanner'
import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { IssueSubIssues } from '@/components/issues/IssueSubIssues'
import { IssueTitleEditor } from '@/components/issues/IssueTitleEditor'
import { IssueWorkingBanner } from '@/components/issues/IssueWorkingBanner'
import { useIssueDetail } from '@/components/issues/useIssueDetail'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { PanelDialogContent } from '@/components/dialogs/PanelDialogContent'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangleIcon, LinkIcon, TicketIcon } from '@/lib/icons'
import { shownRunFailure } from '@/lib/work/run-failure'
import { parseIssueRef, type IssueStatus, type IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

export type IssueDetailDialogProps = {
    // `ENG-12`. Null keeps the dialog closed.
    issueRef: string | null
    onOpenChange: (open: boolean) => void
    // Every change written from the dialog, for the list or the board behind it.
    onIssueChange?: (issue: IssueSummary) => void
    // Opening a sub-issue. Without it the dialog moves to that issue itself.
    onOpenIssue?: (issue: IssueSummary) => void
}

// An issue in full, opened over the board, a list or a deep link: its title, description, status and
// holder, its sub-issues, the comments and the log. A bottom sheet on a phone.
export function IssueDetailDialog({ issueRef, onOpenChange, onIssueChange, onOpenIssue }: IssueDetailDialogProps) {
    const [localRef, setLocalRef] = useState<{ from: string | null; ref: string } | null>(null)
    const shownRef = localRef && localRef.from === issueRef ? localRef.ref : issueRef
    const openIssue = onOpenIssue ?? ((issue: IssueSummary) => setLocalRef({ from: issueRef, ref: issue.ref }))

    return (
        <Dialog open={!!issueRef} onOpenChange={onOpenChange}>
            <PanelDialogContent className="sm:h-[min(46rem,92dvh)] sm:max-w-4xl">{shownRef && <IssueDetailBody key={shownRef} issueRef={shownRef} onIssueChange={onIssueChange} onOpenIssue={openIssue} />}</PanelDialogContent>
        </Dialog>
    )
}

function IssueDetailBody({ issueRef, onIssueChange, onOpenIssue }: { issueRef: string; onIssueChange?: (issue: IssueSummary) => void; onOpenIssue: (issue: IssueSummary) => void }) {
    const t = useTranslations('issues.detail')
    const { meId } = useWorkMembers()
    const detail = useIssueDetail(issueRef, onIssueChange)
    const [tab, setTab] = useState<'comments' | 'activity'>('comments')
    const [askingReason, setAskingReason] = useState(false)
    const [retriedRunId, setRetriedRunId] = useState<string | null>(null)

    // Described in every state, the skeleton included: the dialog announces its content before it arrives.
    const description = <DialogDescription className="sr-only">{t('srDescription', { ref: issueRef })}</DialogDescription>
    if (detail.state.status === 'loading') {
        return (
            <>
                {description}
                <IssueDetailSkeleton />
            </>
        )
    }
    if (detail.state.status === 'missing') {
        return (
            <>
                <DialogTitle className="sr-only">{issueRef}</DialogTitle>
                {description}
                <EmptyState icon={TicketIcon} title={t('notFound')} description={detail.state.message} className="py-16" />
            </>
        )
    }

    const issue = detail.state.issue
    const runFailure = shownRunFailure(issue)
    const changeStatus = (status: IssueStatus) => {
        if (status === 'blocked') setAskingReason(true)
        else void detail.setStatus(status)
    }

    const copyLink = async () => {
        const parsed = parseIssueRef(issue.ref)
        const url = parsed ? `${window.location.origin}/projects/${parsed.projectKey}?issue=${parsed.number}` : window.location.href
        try {
            await navigator.clipboard.writeText(url)
            toast.success(t('linkCopied', { ref: issue.ref }))
        } catch {
            toast.error(t('linkCopyFailed'))
        }
    }

    return (
        <>
            <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3 sm:pr-12">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{issue.ref}</span>
                    <IssueStatusBadge status={issue.status} />
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => void copyLink()} aria-label={t('copyLink')} title={t('copyLink')} className="text-muted-foreground">
                        <LinkIcon />
                    </Button>
                </div>
                <IssueTitleEditor title={issue.title} onSave={title => detail.update({ title })} />
                {description}
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:overflow-hidden">
                <aside className="border-border px-4 py-4 max-md:order-first max-md:border-b md:overflow-y-auto md:border-l">
                    <IssueProperties issue={issue} onStatusChange={changeStatus} onPriorityChange={priority => void detail.update({ priority })} onAssign={assignee => void detail.assign(assignee)} onUpdate={input => void detail.update(input)} />
                </aside>

                <div className="flex flex-col gap-6 px-4 py-4 md:order-first md:overflow-y-auto">
                    {runFailure && runFailure.runId !== retriedRunId ? <IssueRunFailedBanner issue={issue} failure={runFailure} onRetried={() => setRetriedRunId(runFailure.runId)} /> : <IssueWorkingBanner issue={issue} />}
                    {issue.status === 'blocked' && (
                        <Alert variant="danger">
                            <AlertTriangleIcon />
                            <AlertTitle>{t('blockedTitle')}</AlertTitle>
                            <AlertDescription>{issue.blockedReason || t('blockedNoReason')}</AlertDescription>
                        </Alert>
                    )}
                    <IssueDescriptionEditor description={issue.description} onSave={description => detail.update({ description })} />
                    <IssueSubIssues subIssues={issue.subIssues} canAdd onAdd={detail.createSubIssue} onOpen={onOpenIssue} />
                    <section className="flex flex-col gap-3">
                        <Tabs value={tab} onValueChange={value => setTab(value as 'comments' | 'activity')}>
                            <TabsList className="h-9 border-b border-border">
                                <TabsTrigger value="comments">{t('commentsTab', { count: detail.comments?.length ?? 0 })}</TabsTrigger>
                                <TabsTrigger value="activity">{t('activityTab')}</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        {tab === 'comments' ? <IssueComments comments={detail.comments} meId={meId} onAdd={detail.addComment} onEdit={detail.editComment} /> : <IssueActivity events={detail.activity} />}
                    </section>
                </div>
            </div>

            <BlockedReasonDialog issueRef={issue.ref} open={askingReason} onOpenChange={setAskingReason} onConfirm={reason => detail.setStatus('blocked', reason)} />
        </>
    )
}
