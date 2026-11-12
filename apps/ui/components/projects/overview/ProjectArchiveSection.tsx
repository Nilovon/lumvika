'use client'

import { archiveProjectAction, restoreProjectAction } from '@/app/api/_actions/projects.actions'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { Button } from '@/components/ui/button'
import { useErrorText } from '@/hooks/useErrorText'
import { ArchiveIcon } from '@/lib/icons'
import type { ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

export function ProjectArchiveSection({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
    const t = useTranslations('projects.overview')
    const errorText = useErrorText()
    const [pending, setPending] = useState(false)
    const archived = !!project.archivedAt

    const run = async () => {
        setPending(true)
        const result = archived ? await restoreProjectAction(project.id) : await archiveProjectAction(project.id)
        setPending(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(archived ? t('restored', { name: project.name }) : t('archived', { name: project.name }))
        onChanged()
    }

    return (
        <OverviewSection title={archived ? t('restoreTitle') : t('archiveTitle')} description={archived ? t('restoreExplainer') : t('archiveExplainer')}>
            <ConfirmDialog
                title={archived ? t('restoreConfirmTitle', { name: project.name }) : t('archiveConfirmTitle', { name: project.name })}
                description={archived ? t('restoreConfirmDescription') : t('archiveConfirmDescription')}
                confirmLabel={archived ? t('restore') : t('archive')}
                confirmVariant={archived ? 'default' : 'destructive'}
                pending={pending}
                onConfirm={run}
            >
                <Button type="button" size="sm" variant={archived ? 'outline' : 'destructive'} className="self-start">
                    <ArchiveIcon />
                    {archived ? t('restore') : t('archive')}
                </Button>
            </ConfirmDialog>
        </OverviewSection>
    )
}
