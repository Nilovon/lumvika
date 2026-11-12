'use client'

import { IssueDueDate } from '@/components/issues/IssueDueDate'
import { IssuePriorityIndicator } from '@/components/issues/IssuePriorityIndicator'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ProjectChip } from '@/components/work/ProjectChip'
import { AlertTriangleIcon, CheckIcon } from '@/lib/icons'
import type { ReviewItem } from '@/lib/work/review-queue'
import { fullDateTime, shortRelativeTime } from '@lumvika/i18n/format'
import { Badge } from '@lumvika/ui/primitives'
import { useLocale, useTranslations } from 'next-intl'

type ReviewItemCardProps = {
    item: ReviewItem
    onOpen: (item: ReviewItem) => void
    onApprove: (item: ReviewItem) => void
    onRequestChanges: (item: ReviewItem) => void
    onUnblock: (item: ReviewItem) => void
}

// One issue that waits on a person: what it is, who handed it over and when, what they said (or why
// it is stuck), and the verdicts. Opening it shows the issue in full.
export function ReviewItemCard({ item, onOpen, onApprove, onRequestChanges, onUnblock }: ReviewItemCardProps) {
    const t = useTranslations('review')
    const locale = useLocale()
    const { labelOf } = useWorkMembers()
    const { issue } = item
    const blocked = issue.status === 'blocked'
    const handedName = item.handedBy ? labelOf(item.handedBy)?.name : null
    const commentName = item.lastComment ? (labelOf(item.lastComment.author)?.name ?? '') : ''

    return (
        <article className="@container flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
            <div className="flex items-start gap-3">
                <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ProjectChip name={item.project.name} projectKey={item.project.key} />
                        <span className="font-mono text-[11px] text-muted-foreground">{issue.ref}</span>
                        <IssuePriorityIndicator priority={issue.priority} />
                        {issue.dueDate && <IssueDueDate dueDate={issue.dueDate} status={issue.status} />}
                        {item.mine && (
                            <Badge size="xs" tone="brand" glow={false} className="font-medium">
                                {t('mine')}
                            </Badge>
                        )}
                    </span>
                    <span className="text-sm font-medium break-words hover:underline">{issue.title}</span>
                </button>
                <time dateTime={item.handedAt} title={fullDateTime(item.handedAt, locale)} className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
                    {shortRelativeTime(item.handedAt, locale)}
                </time>
            </div>

            {item.handedBy && handedName && (
                <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <WorkMemberAvatar member={item.handedBy.kind === 'system' ? null : item.handedBy} size="xs" />
                    <span className="truncate">{blocked ? t('handed.blocked', { name: handedName }) : t('handed.finished', { name: handedName })}</span>
                </span>
            )}

            {blocked ? (
                <Alert variant="warning">
                    <AlertTriangleIcon />
                    <AlertTitle>{t('blockedReasonTitle')}</AlertTitle>
                    <AlertDescription className="break-words whitespace-pre-line">{item.blockedReason ?? t('noReason')}</AlertDescription>
                </Alert>
            ) : item.lastComment ? (
                <figure className="flex flex-col gap-1 border-l-2 border-border pl-3">
                    <figcaption className="text-xs text-muted-foreground">{t('lastComment', { name: commentName })}</figcaption>
                    <blockquote className="line-clamp-3 text-sm break-words whitespace-pre-line text-foreground/90">{item.lastComment.body}</blockquote>
                </figure>
            ) : (
                <p className="text-xs text-muted-foreground">{t('noComment')}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(item)} className="@max-md:flex-1">
                    {t('actions.open')}
                </Button>
                {blocked ? (
                    <Button type="button" size="sm" onClick={() => onUnblock(item)} className="@max-md:flex-1">
                        {t('actions.unblock')}
                    </Button>
                ) : (
                    <>
                        <Button type="button" size="sm" variant="outline" onClick={() => onRequestChanges(item)} className="@max-md:flex-1">
                            {t('actions.requestChanges')}
                        </Button>
                        <Button type="button" size="sm" onClick={() => onApprove(item)} className="@max-md:flex-1">
                            <CheckIcon />
                            {t('actions.approve')}
                        </Button>
                    </>
                )}
            </div>
        </article>
    )
}
