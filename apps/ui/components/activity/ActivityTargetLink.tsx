'use client'

import type { ActivityTarget } from '@/components/activity/activity-sentence'
import Link from 'next/link'
import type { ReactNode } from 'react'

const LINK_CLASS = 'font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none'

function hrefOf(target: ActivityTarget): string | null {
    switch (target.kind) {
        case 'project':
            return target.key ? `/projects/${target.key}` : null
        case 'goal':
            return '/goals'
        case 'team':
            return '/teams'
        case 'channel':
            return `/channels/${target.id}`
        case 'coworker':
            return `/?agent=${encodeURIComponent(target.agentId)}`
        case 'issue':
            return null
    }
}

// What an event was done to, as a link: an issue opens over the feed, the rest go to their page.
// A target the page cannot reach any more stays plain text.
export function ActivityTargetLink({ target, onOpenIssue, children }: { target: ActivityTarget | null; onOpenIssue?: (ref: string) => void; children: ReactNode }) {
    if (!target) return <span className="font-medium text-foreground">{children}</span>
    if (target.kind === 'issue') {
        const ref = target.ref
        if (!ref || !onOpenIssue) return <span className="font-medium text-foreground">{children}</span>
        return (
            <button type="button" onClick={() => onOpenIssue(ref)} className={`${LINK_CLASS} text-left`}>
                {children}
            </button>
        )
    }
    const href = hrefOf(target)
    if (!href) return <span className="font-medium text-foreground">{children}</span>
    return (
        <Link href={href} className={LINK_CLASS}>
            {children}
        </Link>
    )
}
