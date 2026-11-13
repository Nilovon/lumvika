'use client'

import { ProjectAboutForm } from '@/components/projects/overview/ProjectAboutForm'
import { ProjectAccessSummary } from '@/components/projects/overview/ProjectAccessSummary'
import { ProjectArchiveSection } from '@/components/projects/overview/ProjectArchiveSection'
import { ProjectDetailsSection } from '@/components/projects/overview/ProjectDetailsSection'
import { ProjectProgressSection } from '@/components/projects/overview/ProjectProgressSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoIcon } from '@/lib/icons'
import type { ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

// The project itself: what it is about, the context its coworkers get, its state, who reaches it.
// Someone who only uses the project reads it all; the controls ask for manage access.
export function ProjectOverview({ project, onChanged }: { project: ProjectDetail; onChanged: () => void }) {
    const t = useTranslations('projects.overview')
    const canManage = project.access === 'manage'

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-6">
                {!canManage && (
                    <Alert>
                        <InfoIcon />
                        <AlertDescription>{t('readOnly')}</AlertDescription>
                    </Alert>
                )}
                <ProjectAboutForm key={`${project.name}\n${project.description}\n${project.instructions}`} project={project} disabled={!canManage} onSaved={onChanged} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
                <ProjectProgressSection project={project} />
                <ProjectDetailsSection project={project} disabled={!canManage} onSaved={onChanged} />
                <ProjectAccessSummary project={project} canManage={canManage} onChanged={onChanged} />
                {canManage && <ProjectArchiveSection project={project} onChanged={onChanged} />}
            </div>
        </div>
    )
}
