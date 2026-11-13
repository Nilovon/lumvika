'use client'

import type { ActivityRefs } from '@/app/api/_services/work/activity-feed.service'
import { ActivitySentenceText } from '@/components/activity/ActivitySentenceText'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from '@lumvika/contracts'
import { fullDateTime, messageTime, shortRelativeTime } from '@lumvika/i18n/format'
import { useLocale } from 'next-intl'

// One line of a feed: who (a person's photo or a coworker's buddy), the sentence, and when. `relative`
// shows "2h" where the day is not already a header.
export function ActivityEventItem({ event, refs, onOpenIssue, relative = false, className }: { event: ActivityEvent; refs: ActivityRefs; onOpenIssue?: (ref: string) => void; relative?: boolean; className?: string }) {
    const locale = useLocale()
    return (
        <li className={cn('flex items-start gap-3 py-2.5', className)}>
            <span className="flex h-5 shrink-0 items-center">
                <WorkMemberAvatar member={event.actor.kind === 'system' ? null : event.actor} size="sm" />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-5 break-words text-muted-foreground">
                <ActivitySentenceText event={event} refs={refs} onOpenIssue={onOpenIssue} />
            </p>
            <time dateTime={event.createdAt} title={fullDateTime(event.createdAt, locale)} className="shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">
                {relative ? shortRelativeTime(event.createdAt, locale) : messageTime(event.createdAt, locale)}
            </time>
        </li>
    )
}
