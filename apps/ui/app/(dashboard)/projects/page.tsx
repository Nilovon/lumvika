import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProjectsScreen } from '@/components/projects/ProjectsScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('projects')
    return { title: t('title') }
}

export default async function ProjectsPage() {
    await requirePlatformAccess()
    return <ProjectsScreen />
}
