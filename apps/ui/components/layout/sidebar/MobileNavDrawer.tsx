'use client'

import { SidebarContents } from '@/components/layout/sidebar/SidebarContents'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useShellStore } from '@/stores/shell.store'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Below `md` the sidebar is a drawer from the left, opened by the menu button of the board's corner
// or of a page header. A route change closes it, whatever started the navigation.
export function MobileNavDrawer() {
    const t = useTranslations('layout.nav')
    const open = useShellStore(s => s.drawerOpen)
    const setOpen = useShellStore(s => s.setDrawerOpen)
    const pathname = usePathname()

    useEffect(() => {
        useShellStore.getState().setDrawerOpen(false)
    }, [pathname])

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="left" showCloseButton={false} className="w-[min(18rem,85vw)] gap-0 border-r-border bg-frame p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
                <SheetTitle className="sr-only">{t('label')}</SheetTitle>
                <SheetDescription className="sr-only">{t('drawerDescription')}</SheetDescription>
                <SidebarContents mode="full" onNavigate={() => setOpen(false)} />
            </SheetContent>
        </Sheet>
    )
}
