'use client'

import type { ProjectAccessPerson } from '@/app/api/_actions/projects.actions'
import { AccessDrillHeader } from '@/components/dialogs/AccessDrillHeader'
import { OptionWithDescription } from '@/components/dialogs/AccessLevelOption'
import { asIs, personLabel } from '@/components/dialogs/access-person'
import { useProjectAccessLevels } from '@/components/projects/access/project-access-copy'
import { Button } from '@/components/ui/button'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Field } from '@/components/ui/field'
import { PanelScroller } from '@/components/ui/panel-list'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AuthorProfile } from '@/lib/chat/message-author'
import type { ProjectAccess } from '@lumvika/contracts'
import { CardAvatar } from '@lumvika/ui/chat'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type ProjectAccessAddPeopleProps = {
    projectName: string
    members: ProjectAccessPerson[]
    listedUserIds: Set<string>
    profileOf: (userId: string) => AuthorProfile | null
    onBack: () => void
    onAdd: (userIds: string[], access: ProjectAccess) => Promise<boolean>
}

export function ProjectAccessAddPeople({ projectName, members, listedUserIds, profileOf, onBack, onAdd }: ProjectAccessAddPeopleProps) {
    const t = useTranslations('projects.access')
    const tCommon = useTranslations('common')
    const levels = useProjectAccessLevels()
    const [picked, setPicked] = useState<string[]>([])
    const [access, setAccess] = useState<ProjectAccess>('use')
    const [adding, setAdding] = useState(false)

    // Admins reach every project already: they are listed, but cannot be picked.
    const options = useMemo(
        () =>
            members
                .filter(member => !listedUserIds.has(member.userId))
                .map((member): ComboboxOption => {
                    const profile = profileOf(member.userId)
                    const { title, email } = personLabel(profile, member.email, t('teammate'))
                    const isAdmin = member.role === 'admin'
                    return {
                        value: member.userId,
                        label: title,
                        keywords: [title, email ?? ''],
                        leading: <CardAvatar src={profile?.photo} fileUrl={asIs} name={title} className="size-5" />,
                        disabled: isAdmin,
                        hint: isAdmin ? t('adminsAlways') : undefined,
                    }
                })
                .sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled)),
        [members, listedUserIds, profileOf, t],
    )

    const add = async () => {
        if (picked.length === 0 || adding) return
        setAdding(true)
        const added = await onAdd(picked, access)
        setAdding(false)
        if (added) onBack()
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <AccessDrillHeader title={t('add.title')} hint={projectName} backLabel={t('add.back')} onBack={onBack} />
            <PanelScroller className="space-y-4 p-4">
                <Field label={t('add.peopleField')}>
                    <Combobox multiple groups={[{ id: 'members', options }]} value={picked} onChange={setPicked} placeholder={t('add.placeholder')} searchPlaceholder={t('add.search')} emptyText={t('add.empty')} />
                </Field>
                <Field label={t('add.accessField')} htmlFor="project-access-level">
                    <Select value={access} onValueChange={value => setAccess(value as ProjectAccess)}>
                        <SelectTrigger id="project-access-level" className="w-full">
                            <SelectValue>{levels[access].label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper">
                            <SelectItem value="use">
                                <OptionWithDescription {...levels.use} />
                            </SelectItem>
                            <SelectItem value="manage">
                                <OptionWithDescription {...levels.manage} />
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={onBack} className="max-sm:flex-1">
                        {tCommon('cancel')}
                    </Button>
                    <Button onClick={add} disabled={picked.length === 0} loading={adding} className="max-sm:flex-1">
                        {t('add.submit', { count: picked.length })}
                    </Button>
                </div>
            </PanelScroller>
        </div>
    )
}
