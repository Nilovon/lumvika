import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProjectScreen } from '@/components/projects/ProjectScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('projects')
    return { title: t('title') }
}

export default async function ProjectPage({ params }: { params: Promise<{ projectKey: string }> }) {
    await requirePlatformAccess()
    const { projectKey } = await params
    return <ProjectScreen projectKey={projectKey} />
}
