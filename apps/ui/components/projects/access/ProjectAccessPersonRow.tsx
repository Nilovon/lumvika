'use client'

import type { ProjectAccessPerson } from '@/app/api/_actions/projects.actions'
import { OPTION_LIST_CLASS, OptionWithDescription } from '@/components/dialogs/AccessLevelOption'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { asIs, personLabel } from '@/components/dialogs/access-person'
import { useProjectAccessLevels } from '@/components/projects/access/project-access-copy'
import { Button } from '@/components/ui/button'
import { PanelRow } from '@/components/ui/panel-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import type { AuthorProfile } from '@/lib/chat/message-author'
import { XIcon } from '@/lib/icons'
import type { ProjectAccess, ProjectMember, ProjectVisibility } from '@lumvika/contracts'
import { CardAvatar } from '@lumvika/ui/chat'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

type ProjectAccessPersonRowProps = {
    person: ProjectMember
    member: ProjectAccessPerson | undefined
    profile: AuthorProfile | null
    visibility: ProjectVisibility
    busy: boolean
    onAccessChange: (access: ProjectAccess) => void
    onRemove: () => void
}

export function ProjectAccessPersonRow({ person, member, profile, visibility, busy, onAccessChange, onRemove }: ProjectAccessPersonRowProps) {
    const t = useTranslations('projects.access')
    const levels = useProjectAccessLevels()
    const { title, email, named } = personLabel(profile, member?.email ?? null, t('teammate'))
    const isAdmin = member?.role === 'admin'

    return (
        <PanelRow
            leading={<CardAvatar src={profile?.photo} fileUrl={asIs} name={title} className="size-8" />}
            title={title}
            meta={
                isAdmin ? (
                    <Badge size="xs" tone="brand" glow={false}>
                        {t('admin')}
                    </Badge>
                ) : undefined
            }
            description={named ? email : undefined}
            actions={
                <>
                    <TooltipDisabledReason reason={isAdmin ? t('adminsAlways') : undefined}>
                        <Select value={person.access} onValueChange={value => onAccessChange(value as ProjectAccess)} disabled={busy || isAdmin}>
                            <SelectTrigger size="sm" className="w-28 shrink-0 sm:w-32" aria-label={t('accessOf', { person: title })}>
                                <SelectValue>{levels[person.access].label}</SelectValue>
                            </SelectTrigger>
                            <SelectContent position="popper" align="end" className={OPTION_LIST_CLASS}>
                                <SelectItem value="use">
                                    <OptionWithDescription {...levels.use} />
                                </SelectItem>
                                <SelectItem value="manage">
                                    <OptionWithDescription {...levels.manage} />
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </TooltipDisabledReason>
                    <ConfirmDialog title={t('remove.title', { person: title })} description={visibility === 'restricted' && !isAdmin ? t('remove.restricted') : t('remove.open')} confirmLabel={t('remove.confirm')} onConfirm={onRemove}>
                        <Button type="button" variant="ghost" size="icon-xs" disabled={busy} aria-label={t('remove.ariaLabel', { person: title })} className="text-muted-foreground">
                            <XIcon className="size-4" />
                        </Button>
                    </ConfirmDialog>
                </>
            }
        />
    )
}
