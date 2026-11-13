import { PROJECT_STATUS_TONES } from '@/components/issues/issue-status'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
    const t = useTranslations('projects.status')
    return (
        <Badge size="xs" tone={PROJECT_STATUS_TONES[status]} glow={false} fill={status === 'archived' ? 'outline' : 'soft'} className={cn('shrink-0 font-medium', className)}>
            {t(status)}
        </Badge>
    )
}
