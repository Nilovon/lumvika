'use client'

import { SUPPORT_CHAT_ENABLED } from '@lumvika/cloud/support'
import { ChromePill } from '@lumvika/ui/chrome'
import { HelpMenuItems } from '@/components/layout/ToolbarActions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipLabeled } from '@/components/ui/tooltip'
import { HeadsetIcon, HelpCircleIcon } from '@/lib/icons'
import { openCrisp } from '@/lib/crisp'
import { useSession } from '@/supabase/session/SessionProvider'
import { useTranslations } from 'next-intl'
import { useRef, type ReactNode } from 'react'

export function HelpButton() {
    const t = useTranslations('layout.help')
    return (
        <HelpMenu>
            <ChromePill start="icon" end="icon" aria-label={t('label')}>
                <HelpCircleIcon className="size-4 text-muted-foreground" />
            </ChromePill>
        </HelpMenu>
    )
}

// The trigger is a child so the menu can sit on the board as a pill and in the sidebar as a row.
// It carries its own tooltip: the row of an expanded sidebar has a visible label.
export function HelpMenu({ children, side = 'bottom', tooltip = true }: { children: ReactNode; side?: 'top' | 'right' | 'bottom'; tooltip?: boolean }) {
    const t = useTranslations('layout.help')
    const { session } = useSession()
    // The menu hands focus back to its trigger as it closes, which the checklist popover would read
    // as a click outside and close on the spot.
    const openingGettingStarted = useRef(false)

    return (
        <DropdownMenu>
            {tooltip ? (
                <TooltipLabeled label={t('label')} side={side === 'top' ? 'right' : 'bottom'}>
                    <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
                </TooltipLabeled>
            ) : (
                <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            )}
            <DropdownMenuContent
                align="start"
                side={side}
                className="w-56 max-h-[calc(100dvh-5rem)] overflow-y-auto"
                onCloseAutoFocus={event => {
                    if (!openingGettingStarted.current) return
                    openingGettingStarted.current = false
                    event.preventDefault()
                }}
            >
                {SUPPORT_CHAT_ENABLED && (
                    <>
                        <DropdownMenuItem onSelect={() => openCrisp(session?.user?.email)} className="gap-2 text-muted-foreground">
                            <HeadsetIcon className="size-4" />
                            {t('contactSupport')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                    </>
                )}
                <HelpMenuItems
                    onOpenGettingStarted={() => {
                        openingGettingStarted.current = true
                    }}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
