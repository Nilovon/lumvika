'use client'

import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

// The project an issue belongs to, set before its title in a list that mixes projects. A data tag,
// not a status: it carries no tone.
export function ProjectChip({ name, projectKey, className }: { name: string; projectKey: string; className?: string }) {
    const t = useTranslations('work')
    return (
        <span title={`${projectKey} · ${name}`} className={cn('inline-flex max-w-28 shrink-0 items-center rounded-md @max-2xs:hidden border border-border bg-muted/40 px-1.5 py-px text-[11px] leading-4 text-muted-foreground sm:max-w-36', className)}>
            <span aria-hidden className="truncate">
                {name}
            </span>
            <span className="sr-only">{t('projectChip', { name })}</span>
        </span>
    )
}
