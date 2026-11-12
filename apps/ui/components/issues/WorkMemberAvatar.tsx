'use client'

import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { cn } from '@/lib/utils'
import type { WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { CardAvatar } from '@lumvika/ui/chat'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'

export type WorkMemberAvatarSize = 'xs' | 'sm' | 'md'

const BUDDY_SIZES: Record<WorkMemberAvatarSize, number> = { xs: 16, sm: 20, md: 28 }
const AVATAR_SIZES: Record<WorkMemberAvatarSize, string> = { xs: 'size-4 text-[8px]', sm: 'size-5 text-[9px]', md: 'size-7 text-[11px]' }

const asIs = (path: string) => path

// A person, drawn with their photo or initials, or a coworker, drawn as its buddy. `null` is nobody:
// a dashed ring, named "Unassigned" when the name is shown.
// `working` animates a coworker that holds the issue right now.
export function WorkMemberAvatar({ member, size = 'sm', showName = false, working = false, className }: { member: WorkMemberRef | WorkAuthor | null; size?: WorkMemberAvatarSize; showName?: boolean; working?: boolean; className?: string }) {
    const t = useTranslations('issues.member')
    const { labelOf } = useWorkMembers()
    const label = labelOf(member)
    const name = label?.name ?? t('unassigned')

    const glyph =
        member?.kind === 'agent' ? (
            <AgentBuddy agentId={member.agentId} size={BUDDY_SIZES[size]} mood={working ? 'working' : 'idle'} animated={working} facing="right" className="shrink-0" />
        ) : member?.kind === 'user' ? (
            <CardAvatar src={label?.photo ?? undefined} fileUrl={asIs} name={name} className={AVATAR_SIZES[size]} />
        ) : (
            <span aria-hidden className={cn('shrink-0 rounded-full border border-dashed border-muted-foreground/50', AVATAR_SIZES[size])} />
        )

    return (
        <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={showName ? undefined : name}>
            {glyph}
            {showName ? <span className={cn('truncate', !member && 'text-muted-foreground')}>{name}</span> : <span className="sr-only">{name}</span>}
        </span>
    )
}
