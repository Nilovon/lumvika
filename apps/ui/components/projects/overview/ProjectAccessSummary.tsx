'use client'

import { ProjectAccessDialog } from '@/components/projects/access/ProjectAccessDialog'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { Button } from '@/components/ui/button'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { GlobeIcon, LockIcon } from '@/lib/icons'
import type { ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

const AVATARS_SHOWN = 6

export function ProjectAccessSummary({ project, canManage, onChanged }: { project: ProjectDetail; canManage: boolean; onChanged: () => void }) {
    const t = useTranslations('projects.overview')
    const [open, setOpen] = useState(false)
    const restricted = project.visibility === 'restricted'
    const VisibilityIcon = restricted ? LockIcon : GlobeIcon
    const hidden = project.members.length - AVATARS_SHOWN

    return (
        <OverviewSection title={t('accessTitle')}>
            <div className="flex items-start gap-2.5">
                <VisibilityIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm">{restricted ? t('accessRestricted', { count: project.members.length }) : project.members.length > 0 ? t('accessWorkspaceNamed', { count: project.members.length }) : t('accessWorkspace')}</p>
            </div>
            {project.members.length > 0 && (
                <div className="flex items-center -space-x-1">
                    {project.members.slice(0, AVATARS_SHOWN).map(member => (
                        <span key={member.userId} className="rounded-full ring-2 ring-background">
                            <WorkMemberAvatar member={{ kind: 'user', userId: member.userId }} size="md" />
                        </span>
                    ))}
                    {hidden > 0 && <span className="pl-2.5 text-xs text-muted-foreground">+{hidden}</span>}
                </div>
            )}
            <TooltipDisabledReason reason={canManage ? undefined : t('manageOnly')} className="self-start">
                <Button type="button" size="sm" variant="outline" disabled={!canManage} onClick={() => setOpen(true)}>
                    {t('manageAccess')}
                </Button>
            </TooltipDisabledReason>
            {canManage && <ProjectAccessDialog project={project} open={open} onOpenChange={setOpen} onChanged={onChanged} />}
        </OverviewSection>
    )
}
