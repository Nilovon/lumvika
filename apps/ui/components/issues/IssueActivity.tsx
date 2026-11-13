'use client'

import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { Skeleton } from '@/components/ui/skeleton'
import { issueStatusSchema, workMemberRefSchema, type ActivityEvent } from '@lumvika/contracts'
import { fullDateTime, shortRelativeTime } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { NameSkeleton } from '@/components/issues/NameSkeleton'

// What happened to the issue, oldest first, each line signed by who did it.
export function IssueActivity({ events }: { events: ActivityEvent[] | null }) {
    const t = useTranslations('issues.activity')
    const tStatus = useTranslations('issues.status')
    const locale = useLocale()
    const { labelOf } = useWorkMembers()

    if (events === null) {
        return (
            <div className="flex flex-col gap-3">
                {['w-48', 'w-64', 'w-40'].map(width => (
                    <div key={width} className="flex items-center gap-2">
                        <Skeleton className="size-4 rounded-full" />
                        <Skeleton className={`h-3 ${width}`} />
                    </div>
                ))}
            </div>
        )
    }
    if (events.length === 0) return <p className="text-xs text-muted-foreground">{t('empty')}</p>

    const loadingName = (event: ActivityEvent): boolean => {
        if (labelOf(event.actor)?.loading) return true
        const assignee = event.action === 'issue.assigned' ? workMemberRefSchema.safeParse(event.metadata.assignee) : null
        return !!assignee?.success && !!labelOf(assignee.data)?.loading
    }

    const sentence = (event: ActivityEvent): string => {
        const actor = labelOf(event.actor)?.name ?? ''
        const meta = event.metadata
        switch (event.action) {
            case 'issue.created':
                return t('created', { actor })
            case 'issue.status_changed': {
                const from = issueStatusSchema.safeParse(meta.from)
                const to = issueStatusSchema.safeParse(meta.to)
                return from.success && to.success ? t('statusChanged', { actor, from: tStatus(from.data), to: tStatus(to.data) }) : t('updated', { actor })
            }
            case 'issue.assigned': {
                const assignee = workMemberRefSchema.safeParse(meta.assignee)
                return t('assigned', { actor, assignee: assignee.success ? (labelOf(assignee.data)?.name ?? '') : '' })
            }
            case 'issue.unassigned':
                return t('unassigned', { actor })
            case 'issue.commented':
                return t('commented', { actor })
            case 'issue.comment_edited':
                return t('commentEdited', { actor })
            case 'issue.checked_out':
                return t('checkedOut', { actor })
            case 'issue.released':
                return t('released', { actor })
            case 'issue.run_failed':
                return t('runFailed', { actor })
            default:
                return t('updated', { actor })
        }
    }

    return (
        <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-2 before:w-px before:bg-border">
            {[...events].reverse().map(event => (
                <li key={event.id} className="relative flex items-start gap-2.5 text-xs">
                    <span className="relative z-10 flex shrink-0 rounded-full bg-popover">
                        <WorkMemberAvatar member={event.actor.kind === 'system' ? null : event.actor} size="xs" />
                    </span>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                        {loadingName(event) ? <NameSkeleton className="w-40 max-w-full" /> : <span className="text-foreground">{sentence(event)}</span>}
                        <time dateTime={event.createdAt} title={fullDateTime(event.createdAt, locale)} className="ml-1.5 whitespace-nowrap">
                            {shortRelativeTime(event.createdAt, locale)}
                        </time>
                    </span>
                </li>
            ))}
        </ol>
    )
}
