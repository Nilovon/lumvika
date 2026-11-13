'use client'

import { addTeamMemberAction, deleteTeamAction, removeTeamMemberAction, setTeamMemberRoleAction } from '@/app/api/_actions/teams.actions'
import type { TeamOverview } from '@/app/api/_services/work/teams.service'
import { EmptyPitch, Group } from '@/components/connections/AiProvidersPanel'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { PanelDialogContent } from '@/components/dialogs/PanelDialogContent'
import { TeamColorDot } from '@/components/teams/TeamColorDot'
import { TeamDialog } from '@/components/teams/TeamDialog'
import { TeamMemberPicker } from '@/components/teams/TeamMemberPicker'
import { TeamMemberRow, type TeamMemberChange } from '@/components/teams/TeamMemberRow'
import { memberKey, type useWorkMembers } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useErrorText } from '@/hooks/useErrorText'
import { EllipsisIcon, KanbanIcon, PencilIcon, Trash2Icon } from '@/lib/icons'
import { useIsWorkspaceAdmin } from '@/lib/auth/session/SessionProvider'
import type { Team, WorkMemberRef } from '@lumvika/contracts'
import { PanelRow, PanelScroller } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

type TeamDetailDialogProps = {
    team: TeamOverview | null
    members: ReturnType<typeof useWorkMembers>
    onOpenChange: (open: boolean) => void
    onChanged: (team: Team) => void
    onDeleted: (teamId: string) => void
}

export function TeamDetailDialog({ team, members, onOpenChange, onChanged, onDeleted }: TeamDetailDialogProps) {
    return (
        <Dialog open={!!team} onOpenChange={onOpenChange}>
            {team && (
                <PanelDialogContent className="sm:max-w-xl">
                    <TeamDetail team={team} members={members} onChanged={onChanged} onDeleted={onDeleted} />
                </PanelDialogContent>
            )}
        </Dialog>
    )
}

function TeamDetail({ team, members, onChanged, onDeleted }: Omit<TeamDetailDialogProps, 'team' | 'onOpenChange'> & { team: TeamOverview }) {
    const t = useTranslations('teams.detail')
    const errorText = useErrorText()
    const router = useRouter()
    const isAdmin = useIsWorkspaceAdmin()
    const [editing, setEditing] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [busy, setBusy] = useState(false)

    const rows = team.members.map(entry => ({ entry, identity: members.identify(entry.member) }))
    const leadsIt = rows.some(row => row.entry.role === 'lead' && row.identity.isMe)
    const canManageMembers = isAdmin || leadsIt
    const taken = new Set(team.members.map(entry => memberKey(entry.member)))

    const run = async (change: () => ReturnType<typeof addTeamMemberAction>, success: string) => {
        setBusy(true)
        const result = await change()
        setBusy(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return false
        }
        onChanged(result.team)
        toast.success(success)
        return true
    }

    const add = (member: WorkMemberRef, name: string) => run(() => addTeamMemberAction(team.id, { member }), t('added', { name, team: team.name }))

    const change = (memberId: string, name: string, next: TeamMemberChange) => {
        if (next === 'remove') return run(() => removeTeamMemberAction(team.id, memberId), t('removed', { name, team: team.name }))
        return run(() => setTeamMemberRoleAction(team.id, memberId, next), next === 'lead' ? t('leadSet', { name, team: team.name }) : t('leadCleared', { name, team: team.name }))
    }

    const remove = async () => {
        setBusy(true)
        const result = await deleteTeamAction(team.id)
        setBusy(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        setDeleting(false)
        toast.success(t('deleted'))
        onDeleted(team.id)
    }

    return (
        <>
            <DialogHeader className="border-b px-4 py-4">
                <div className="flex min-w-0 items-center gap-2 pr-8">
                    <TeamColorDot color={team.color} />
                    <DialogTitle className="min-w-0 truncate">{team.name}</DialogTitle>
                    {isAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={t('more')} className="ml-auto shrink-0">
                                    <EllipsisIcon />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-auto">
                                <DropdownMenuItem onSelect={() => setEditing(true)} className="whitespace-nowrap">
                                    <PencilIcon />
                                    {t('edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)} className="whitespace-nowrap">
                                    <Trash2Icon />
                                    {t('delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                {team.description && <DialogDescription className="line-clamp-3">{team.description}</DialogDescription>}
            </DialogHeader>
            <PanelScroller className="space-y-6 p-4">
                <Group title={t('members')} addMenu={canManageMembers && <TeamMemberPicker people={members.people} coworkers={members.coworkers} taken={taken} disabled={busy} onPick={(member, name) => void add(member, name)} />}>
                    {rows.length === 0 ? (
                        <EmptyPitch text={t('noMembers')} actions={null} />
                    ) : (
                        rows.map(({ entry, identity }) => <TeamMemberRow key={entry.id} identity={identity} role={entry.role} teamName={team.name} editable={canManageMembers} busy={busy} onChange={next => change(entry.id, identity.name, next)} />)
                    )}
                    {!canManageMembers && <p className="pt-1 text-xs text-muted-foreground">{t('readOnly')}</p>}
                </Group>
                <Group title={t('projects')}>
                    {team.projects.length === 0 ? (
                        <EmptyPitch text={t('noProjects')} actions={null} />
                    ) : (
                        team.projects.map(project => (
                            <PanelRow key={project.id} leading={<KanbanIcon className="size-4 text-muted-foreground" />} title={project.name} meta={<span className="text-xs text-muted-foreground">{project.key}</span>} onClick={() => router.push(`/projects/${project.key}`)} />
                        ))
                    )}
                </Group>
            </PanelScroller>
            <TeamDialog open={editing} onOpenChange={setEditing} team={team} onSaved={onChanged} />
            <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t('deleteTitle', { name: team.name })} description={t('deleteDescription')} confirmLabel={t('deleteConfirm')} pending={busy} onConfirm={event => {
                event.preventDefault()
                void remove()
            }} />
        </>
    )
}
