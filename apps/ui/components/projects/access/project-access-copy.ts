'use client'

import type { ProjectAccess } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export function useProjectAccessLevels(): Record<ProjectAccess, { label: string; description: string }> {
    const t = useTranslations('projects.access.levels')
    return {
        use: { label: t('use.label'), description: t('use.description') },
        manage: { label: t('manage.label'), description: t('manage.description') },
    }
}
