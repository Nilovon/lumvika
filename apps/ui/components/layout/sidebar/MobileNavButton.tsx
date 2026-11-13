'use client'

import { ChromePill } from '@lumvika/ui/chrome'
import { Button } from '@/components/ui/button'
import { Menu } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/stores/shell.store'
import { useTranslations } from 'next-intl'

// Below `md` the sidebar is a drawer. On the board the button is a chrome pill beside the workspace
// pill; in a page header it is a plain icon button before the title.
export function MobileNavButton({ variant = 'chrome', className }: { variant?: 'chrome' | 'plain'; className?: string }) {
    const t = useTranslations('layout.nav')
    const open = () => useShellStore.getState().setDrawerOpen(true)

    if (variant === 'plain') {
        return (
            <Button variant="ghost" size="icon" onClick={open} aria-label={t('open')} className={cn('-ml-1.5 shrink-0 md:hidden', className)}>
                <Menu className="size-4" />
            </Button>
        )
    }

    return (
        <ChromePill start="icon" end="icon" onClick={open} aria-label={t('open')} className={cn('md:hidden', className)}>
            <Menu className="size-4 text-muted-foreground" />
        </ChromePill>
    )
}
