'use client'

import type { WorkAuthor } from '@lumvika/contracts'
import { CardAvatar } from '@lumvika/ui/chat'
import { AgentBuddy } from '@lumvika/ui/iso-grid'

import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { cn } from '@/lib/utils'

const asIs = (path: string) => path

const SIZES = { sm: { box: 'size-6', buddy: 22 }, md: { box: 'size-8', buddy: 30 } } as const

// A person by their photo or initials, a coworker by its buddy: never a generic robot.
export function MemberAvatar({ author, directory, size = 'md', className }: { author: WorkAuthor; directory: ChannelDirectory; size?: keyof typeof SIZES; className?: string }) {
    const dimensions = SIZES[size]
    if (author.kind === 'agent') {
        return (
            <span className={cn('flex shrink-0 items-center justify-center', dimensions.box, className)}>
                <AgentBuddy agentId={author.agentId} size={dimensions.buddy} animated={false} facing="right" />
            </span>
        )
    }
    const person = author.kind === 'user' ? directory.person(author.userId) : null
    return <CardAvatar src={person?.photo ?? undefined} fileUrl={asIs} name={person?.name ?? '?'} className={cn(dimensions.box, className)} />
}
