'use client'

import { enterSandboxAction } from '@/app/api/_actions/workspace.actions'
import { WorkspacePowerMenuItems } from '@/components/layout/WorkspacePowerControl'
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu'
import { useErrorText } from '@/hooks/useErrorText'
import { BadgeCheck, FlaskConical, GaugeIcon, GridIcon, IdCardIcon, LayersIcon, Loader2Icon, PlusIcon, ShieldCheckIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { abortWorkspaceSwitch, beginWorkspaceSwitch, enterActiveWorkspace } from '@/lib/workspace/workspace-switch'
import { useCreatorStore } from '@/stores/creator.store'
import { useWorkspaceMenuStore } from '@/stores/workspace-menu.store'
import { useSession } from '@/supabase/session/SessionProvider'
import { ADMIN_URL } from '@lumvika/cloud/admin'
import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

type WorkspaceRoleMenusProps = {
    templateAuthor: boolean
    expert: boolean
    lumvikaAdmin: boolean
    // A switch of workspace already under way: entering the sandbox waits for it.
    switching: boolean
}

// What the person's roles add to the workspace menu: their templates, the expert sandbox and public
// profile, and the admin panel with the machine controls of Lumvika Cloud.
export function hasWorkspaceRoleMenus({ templateAuthor, expert, lumvikaAdmin }: Omit<WorkspaceRoleMenusProps, 'switching'>): boolean {
    return templateAuthor || expert || (LUMVIKA_CLOUD && lumvikaAdmin)
}

export function WorkspaceRoleMenus({ templateAuthor, expert, lumvikaAdmin, switching }: WorkspaceRoleMenusProps) {
    const t = useTranslations('layout.workspaceMenu')
    const errorText = useErrorText()
    const { user, workspace } = useSession()
    // In a store rather than here: the return from Stripe's hosted onboarding lands on the home
    // page and has to reopen this panel on its payouts pane.
    const openCreator = useCreatorStore(s => s.openCreator)
    const setCreateTemplateOpen = useCreatorStore(s => s.setCreateOpen)
    const { setProfileOpen, setPowerAction } = useWorkspaceMenuStore()
    const [entering, setEntering] = useState(false)
    const inSandbox = !!workspace?.is_sandbox

    // Toujours par enterSandboxAction, jamais un simple switch même quand le sandbox existe déjà :
    // l'action est un get-or-create qui réattribue aussi un engine au sandbox qui n'en a pas. Si le
    // pool est vide, elle échoue sans basculer — on reste sur le workspace courant.
    async function handleEnterSandbox() {
        if (switching || entering) return
        setEntering(true)
        beginWorkspaceSwitch()
        const result = await enterSandboxAction()
        if (result.ok) return enterActiveWorkspace()
        abortWorkspaceSwitch()
        toast.error(errorText(result))
        setEntering(false)
    }

    return (
        <>
            {templateAuthor && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-muted-foreground">
                        <LayersIcon className="size-4" />
                        {t('templates')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48">
                        <DropdownMenuItem onSelect={() => openCreator()} className="gap-2 text-muted-foreground">
                            <GridIcon className="size-4" />
                            {t('myTemplates')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setCreateTemplateOpen(true)} className="gap-2 text-muted-foreground">
                            <PlusIcon className="size-4" />
                            {t('newTemplate')}
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
            {expert && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className={cn('gap-2', inSandbox ? 'text-primary' : 'text-muted-foreground')}>
                        <BadgeCheck className="size-4" />
                        {t('expert')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48">
                        <DropdownMenuItem disabled={entering || inSandbox} onSelect={() => handleEnterSandbox()} className={cn('gap-2', inSandbox ? 'text-primary' : 'text-primary/90 focus:text-primary')}>
                            {entering ? <Loader2Icon className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                            <span className="flex-1">{entering ? t('preparingSandbox') : t('sandbox')}</span>
                        </DropdownMenuItem>
                        {user?.expert_profile_id && (
                            <DropdownMenuItem onSelect={() => setProfileOpen(true)} className="gap-2 text-muted-foreground">
                                <IdCardIcon className="size-4" />
                                {t('publicProfile')}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
            {/* The admin panel and the machine controls belong to Lumvika Cloud; a self-hosted install has neither. */}
            {LUMVIKA_CLOUD && lumvikaAdmin && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-muted-foreground">
                        <ShieldCheckIcon className="size-4" />
                        {t('admin')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-48">
                        <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
                            <Link href={`${ADMIN_URL}/admin`}>
                                <GaugeIcon className="size-4" />
                                {t('adminPanel')}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <WorkspacePowerMenuItems onPick={setPowerAction} />
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
        </>
    )
}
