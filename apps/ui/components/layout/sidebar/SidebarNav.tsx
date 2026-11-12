'use client'

import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { SidebarLink, railHidden, type SidebarMode } from '@/components/layout/sidebar/SidebarRow'
import { NAV_GROUPS, activeNavItemId } from '@/lib/shell/nav'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'

export function SidebarNav({ mode, onNavigate }: { mode: SidebarMode; onNavigate?: () => void }) {
    const t = useTranslations('layout.nav')
    const activeId = activeNavItemId(usePathname())

    return (
        <nav aria-label={t('label')} className="flex flex-col gap-3">
            {NAV_GROUPS.map(group => (
                <div key={group.id} role="group" aria-label={group.heading ? t(`groups.${group.heading}`) : undefined} className="flex flex-col gap-0.5">
                    {group.heading && (
                        <div aria-hidden className={cn('flex h-6 items-center px-[13px] text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-opacity duration-150', railHidden(mode))}>
                            {t(`groups.${group.heading}`)}
                        </div>
                    )}
                    {group.items.map(entry => (
                        <SidebarLink key={entry.id} href={entry.href} icon={NAV_ICONS[entry.id]} label={t(`items.${entry.id}`)} mode={mode} active={activeId === entry.id} onNavigate={onNavigate} />
                    ))}
                </div>
            ))}
        </nav>
    )
}
