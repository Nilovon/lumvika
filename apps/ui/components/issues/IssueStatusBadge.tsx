import { ISSUE_STATUS_TONES } from '@/components/issues/issue-status'
import { cn } from '@/lib/utils'
import type { IssueStatus } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

export function IssueStatusBadge({ status, className }: { status: IssueStatus; className?: string }) {
    const t = useTranslations('issues.status')
    return (
        <Badge size="xs" tone={ISSUE_STATUS_TONES[status]} glow={false} className={cn('shrink-0 font-medium', className)}>
            {t(status)}
        </Badge>
    )
}
