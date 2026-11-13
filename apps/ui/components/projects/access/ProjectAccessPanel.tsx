'use client'

import type { ProjectAccessView } from '@/app/api/_actions/projects.actions'
import { AddButton, EmptyPitch, Group } from '@/components/connections/AiProvidersPanel'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { ProjectAccessAddPeople } from '@/components/projects/access/ProjectAccessAddPeople'
import { ProjectAccessPersonRow } from '@/components/projects/access/ProjectAccessPersonRow'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { PanelScroller } from '@/components/ui/panel-list'
import { PanelSteps } from '@/components/ui/panel-steps'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton, SkeletonPanelRows } from '@/components/ui/skeleton'
import type { AuthorProfile } from '@/lib/chat/message-author'
import type { ProjectAccess, ProjectVisibility } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type ProjectAccessPanelProps = {
    projectName: string
    visibility: ProjectVisibility
    access: ProjectAccessView | null
    busy: boolean
    profileOf: (userId: string) => AuthorProfile | null
    onVisibilityChange: (visibility: ProjectVisibility) => void
    onAccessChange: (userId: string, access: ProjectAccess) => void
    onRemove: (userId: string) => void
    onAdd: (userIds: string[], access: ProjectAccess) => Promise<boolean>
}

export function ProjectAccessPanel({ projectName, visibility, access, busy, profileOf, onVisibilityChange, onAccessChange, onRemove, onAdd }: ProjectAccessPanelProps) {
    const t = useTranslations('projects.access')
    const [page, setPage] = useState<'list' | 'add'>('list')
    const [confirmingRestrict, setConfirmingRestrict] = useState(false)
    const listed = useMemo(() => new Set(access?.people.map(person => person.userId) ?? []), [access])
    const memberOf = useMemo(() => new Map(access?.members.map(member => [member.userId, member]) ?? []), [access])

    const pickVisibility = (next: ProjectVisibility) => {
        if (next === visibility) return
        if (next === 'restricted') setConfirmingRestrict(true)
        else onVisibilityChange(next)
    }

    return (
        <>
            <DialogHeader className="border-b px-4 py-4">
                <DialogTitle className="truncate pr-6">{t('title', { project: projectName })}</DialogTitle>
                <DialogDescription>{t('description')}</DialogDescription>
            </DialogHeader>

            <PanelSteps stepKey={page} depth={page === 'list' ? 0 : 1}>
                {!access ? (
                    <AccessSkeleton />
                ) : page === 'add' ? (
                    <ProjectAccessAddPeople projectName={projectName} members={access.members} listedUserIds={listed} profileOf={profileOf} onBack={() => setPage('list')} onAdd={onAdd} />
                ) : (
                    <PanelScroller className="space-y-6 p-4">
                        <Field label={t('visibilityField')} htmlFor="project-access-visibility" helperText={visibility === 'restricted' ? t('visibilityHint.restricted') : t('visibilityHint.workspace')}>
                            <Select value={visibility} onValueChange={value => pickVisibility(value as ProjectVisibility)} disabled={busy}>
                                <SelectTrigger id="project-access-visibility" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper">
                                    <SelectItem value="workspace">{t('visibility.workspace')}</SelectItem>
                                    <SelectItem value="restricted">{t('visibility.restricted')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Group title={t('people')} addMenu={access.people.length > 0 ? <AddButton label={t('addPeople')} disabled={busy} onClick={() => setPage('add')} /> : undefined}>
                            {access.people.length === 0 ? (
                                <EmptyPitch text={visibility === 'restricted' ? t('emptyRestricted') : t('emptyOpen')} actions={<AddButton label={t('addPeople')} disabled={busy} onClick={() => setPage('add')} />} />
                            ) : (
                                access.people.map(person => (
                                    <ProjectAccessPersonRow
                                        key={person.userId}
                                        person={person}
                                        member={memberOf.get(person.userId)}
                                        profile={profileOf(person.userId)}
                                        visibility={visibility}
                                        busy={busy}
                                        onAccessChange={next => onAccessChange(person.userId, next)}
                                        onRemove={() => onRemove(person.userId)}
                                    />
                                ))
                            )}
                        </Group>
                    </PanelScroller>
                )}
            </PanelSteps>

            <ConfirmDialog
                open={confirmingRestrict}
                onOpenChange={setConfirmingRestrict}
                title={t('restrict.title', { project: projectName })}
                description={access?.people.length ? t('restrict.descriptionWithPeople') : t('restrict.descriptionEmpty')}
                confirmLabel={t('restrict.confirm')}
                confirmVariant="default"
                onConfirm={() => onVisibilityChange('restricted')}
            />
        </>
    )
}

function AccessSkeleton() {
    return (
        <div className="space-y-6 p-4">
            <div className="space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-8 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <SkeletonPanelRows rows={3} leading className="space-y-1.5 p-0" />
            </div>
        </div>
    )
}
