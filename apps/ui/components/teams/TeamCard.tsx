'use client'

import type { TeamOverview } from '@/app/api/_services/work/teams.service'
import { MemberAvatar } from '@/components/teams/MemberAvatar'
import { TeamColorDot } from '@/components/teams/TeamColorDot'
import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { KanbanIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { WorkMemberRef } from '@lumvika/contracts'
import { Badge, PANEL_CARD, PANEL_CARD_INTERACTIVE } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

const SHOWN_AVATARS = 6

export function TeamCard({ team, identify, onOpen }: { team: TeamOverview; identify: (ref: WorkMemberRef) => WorkMemberIdentity; onOpen: () => void }) {
    const t = useTranslations('teams.card')
    const members = team.members.map(entry => ({ ...identify(entry.member), role: entry.role }))
    const lead = members.find(member => member.role === 'lead')
    const others = members.filter(member => member !== lead)
    const shown = [...(lead ? [lead] : []), ...others].slice(0, SHOWN_AVATARS)
    const hidden = members.length - shown.length

    return (
        <button type="button" onClick={onOpen} aria-label={t('open', { name: team.name })} className={cn(PANEL_CARD, PANEL_CARD_INTERACTIVE, 'flex min-w-0 flex-col gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
            <div className="flex min-w-0 items-center gap-2">
                <TeamColorDot color={team.color} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{team.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t('members', { count: members.length })}</span>
            </div>
            {team.description && <p className="line-clamp-2 text-xs text-muted-foreground">{team.description}</p>}
            <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                {members.length > 0 && (
                    <div className="flex items-center">
                        <div className="flex -space-x-1.5">
                            {shown.map(member => (
                                <MemberAvatar key={member.key} member={member} className="ring-2 ring-background" />
                            ))}
                        </div>
                        {hidden > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{t('more', { count: hidden })}</span>}
                    </div>
                )}
                {lead && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="truncate">{lead.name}</span>
                        <Badge size="xs" tone="brand" glow={false} className="shrink-0 font-medium">
                            {t('lead')}
                        </Badge>
                    </span>
                )}
                {team.projects.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <KanbanIcon className="size-3.5" />
                        {t('projects', { count: team.projects.length })}
                    </span>
                )}
            </div>
        </button>
    )
}
