'use client'

import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { cn } from '@/lib/utils'
import { CardAvatar } from '@lumvika/ui/chat'
import { AgentBuddy } from '@lumvika/ui/iso-grid'

const asIs = (path: string) => path

export type MemberAvatarSize = 'sm' | 'md' | 'lg'

const BOXES: Record<MemberAvatarSize, { box: string; buddy: number }> = {
    sm: { box: 'size-6', buddy: 20 },
    md: { box: 'size-7', buddy: 24 },
    lg: { box: 'size-8', buddy: 28 },
}

// A person by their photo or initials, a coworker by its buddy: the two read apart at a glance.
export function MemberAvatar({ member, size = 'sm', className }: { member: Pick<WorkMemberIdentity, 'ref' | 'name' | 'photo'>; size?: MemberAvatarSize; className?: string }) {
    const { box, buddy } = BOXES[size]
    if (member.ref.kind === 'agent') {
        return (
            <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-muted', box, className)}>
                <AgentBuddy agentId={member.ref.agentId} size={buddy} animated={false} facing="right" />
            </span>
        )
    }
    return <CardAvatar src={member.photo ?? undefined} fileUrl={asIs} name={member.name} className={cn(box, className)} />
}
