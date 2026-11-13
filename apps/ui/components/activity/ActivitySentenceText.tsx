'use client'

import type { ActivityRefs } from '@/app/api/_services/work/activity-feed.service'
import { activitySentence, type ActivityTarget } from '@/components/activity/activity-sentence'
import { ActivityTargetLink } from '@/components/activity/ActivityTargetLink'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import type { ActivityEvent, GoalStatus, IssueStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { NameSkeleton } from '@/components/issues/NameSkeleton'

// One event as a sentence: who did what to which, from one message per action.
export function ActivitySentenceText({ event, refs, onOpenIssue }: { event: ActivityEvent; refs: ActivityRefs; onOpenIssue?: (ref: string) => void }) {
    const t = useTranslations('activity')
    const tIssueStatus = useTranslations('issues.status')
    const { labelOf } = useWorkMembers()
    const sentence = activitySentence(event, refs)

    const targetLabel = (target: ActivityTarget | null): string => {
        if (!target) return ''
        switch (target.kind) {
            case 'issue':
                return [target.ref, target.title].filter(Boolean).join(' ') || t('fallback.issue')
            case 'project':
                return target.name ?? target.key ?? t('fallback.project')
            case 'goal':
                return target.title ?? t('fallback.goal')
            case 'team':
                return target.name ?? t('fallback.team')
            case 'channel':
                return target.name ? `#${target.name}` : t('fallback.channel')
            case 'coworker':
                return labelOf({ kind: 'agent', agentId: target.agentId })?.name ?? t('fallback.coworker')
        }
    }

    const actor = labelOf(event.actor)
    const member = sentence.member ? labelOf(sentence.member) : null
    if (member?.loading) return <NameSkeleton className="h-3.5 w-48 max-w-full" />

    const statusWord = (word: string): string => (sentence.status?.of === 'goal' ? t(`goalStatus.${word as GoalStatus}`) : tIssueStatus(word as IssueStatus))

    // Every sentence takes a subset of these values: one object serves them all, under the widest key.
    const key = `sentences.${sentence.key}` as 'sentences.genericWithTarget'
    const values = {
        actor: actor?.name ?? t('fallback.someone'),
        target: targetLabel(sentence.target),
        member: member?.name || t('fallback.member'),
        from: sentence.status ? statusWord(sentence.status.from) : '',
        to: sentence.status ? statusWord(sentence.status.to) : '',
        who: (chunks: ReactNode) => (actor?.loading ? <NameSkeleton className="h-3.5" /> : <span className="font-medium text-foreground">{chunks}</span>),
        link: (chunks: ReactNode) => (
            <ActivityTargetLink target={sentence.target} onOpenIssue={onOpenIssue}>
                {chunks}
            </ActivityTargetLink>
        ),
    }
    return t.rich(key, values)
}
