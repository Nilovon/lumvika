'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { ProjectSkeleton } from '@/components/projects/ProjectSkeleton'
import { ProjectWorkspace } from '@/components/projects/ProjectWorkspace'
import { useProject } from '@/components/projects/useProject'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// `projectKey` is the segment of `/projects/[projectKey]`, as typed: ENG and eng reach the same project.
export function ProjectScreen({ projectKey }: { projectKey: string }) {
    const t = useTranslations('projects')
    const { state, reload } = useProject(projectKey)
    const back = { href: '/projects', label: t('detail.back') }

    if (state.status === 'loading') return <ProjectSkeleton back={back} />
    if (state.status === 'missing') {
        return (
            <PageFrame title={projectKey.toUpperCase()} back={back}>
                <EmptyState
                    icon={NAV_ICONS.projects}
                    title={t('detail.notFound')}
                    description={t('detail.notFoundHint')}
                    action={
                        <Button asChild size="sm" variant="outline">
                            <Link href="/projects">{t('detail.back')}</Link>
                        </Button>
                    }
                    className="py-16"
                />
            </PageFrame>
        )
    }
    return <ProjectWorkspace project={state.project} back={back} onProjectChanged={() => void reload()} />
}
