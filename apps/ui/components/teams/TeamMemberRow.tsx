'use client'

import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { MemberAvatar } from '@/components/teams/MemberAvatar'
import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EllipsisIcon } from '@/lib/icons'
import type { TeamMemberRole } from '@lumvika/contracts'
import { Badge, PanelRow } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export type TeamMemberChange = TeamMemberRole | 'remove'

type TeamMemberRowProps = {
    identity: WorkMemberIdentity
    role: TeamMemberRole
    teamName: string
    editable: boolean
    busy: boolean
    onChange: (change: TeamMemberChange) => Promise<boolean>
}

export function TeamMemberRow({ identity, role, teamName, editable, busy, onChange }: TeamMemberRowProps) {
    const t = useTranslations('teams')
    const [removing, setRemoving] = useState(false)
    const name = identity.isMe ? t('member.you', { name: identity.name }) : identity.name

    return (
        <>
            <PanelRow
                leading={<MemberAvatar member={identity} size="lg" />}
                title={name}
                description={identity.ref.kind === 'agent' ? t('member.coworker') : t('member.person')}
                meta={
                    role === 'lead' && (
                        <Badge size="xs" tone="brand" glow={false} className="font-medium">
                            {t('card.lead')}
                        </Badge>
                    )
                }
                actions={
                    editable && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={t('detail.memberActions', { name: identity.name })} disabled={busy}>
                                    <EllipsisIcon />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-auto">
                                <DropdownMenuItem className="whitespace-nowrap" onSelect={() => void onChange(role === 'lead' ? 'member' : 'lead')}>
                                    {role === 'lead' ? t('detail.removeLead') : t('detail.makeLead')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" className="whitespace-nowrap" onSelect={() => setRemoving(true)}>
                                    {t('detail.remove')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )
                }
            />
            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title={t('detail.removeTitle', { name: identity.name, team: teamName })}
                description={t('detail.removeDescription', { name: identity.name })}
                confirmLabel={t('detail.removeConfirm')}
                pending={busy}
                onConfirm={event => {
                    event.preventDefault()
                    void onChange('remove').then(done => done && setRemoving(false))
                }}
            />
        </>
    )
}
