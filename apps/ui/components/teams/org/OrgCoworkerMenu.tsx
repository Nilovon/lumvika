'use client'

import { coworkerHref, type OrgCoworker } from '@/components/teams/org/org-coworker'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

// What clicking a coworker of the chart offers: going to it on the board, or placing it in the chart.
export function OrgCoworkerMenu({ coworker, onEdit, children }: { coworker: OrgCoworker; onEdit: (coworker: OrgCoworker) => void; children: ReactNode }) {
    const t = useTranslations('teams.org')
    const router = useRouter()
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto">
                <DropdownMenuItem className="whitespace-nowrap" onSelect={() => router.push(coworkerHref(coworker.id))}>
                    {t('open')}
                </DropdownMenuItem>
                <DropdownMenuItem className="whitespace-nowrap" onSelect={() => onEdit(coworker)}>
                    {t('edit')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
