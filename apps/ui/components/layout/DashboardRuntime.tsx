'use client'

import { EngineWaitlistDialog } from '@/components/dialogs/EngineWaitlistDialog'
import { ChangelogDialog } from '@/components/changelog/ChangelogDialog'
import { ControlCenter } from '@/components/control-center/ControlCenter'
import { useRewindEnabled } from '@/components/layout/FeatureFlagsProvider'
import { ToolbarDialogs } from '@/components/layout/ToolbarActions'
import { WorkspaceDialogs } from '@/components/layout/WorkspaceDialogs'
import { StewardDock } from '@/components/steward/StewardDock'
import { useAgentHealthSync } from '@/hooks/useAgentHealthSync'
import { useAgentSchedulesSync } from '@/hooks/useAgentSchedulesSync'
import { useEntryWalls } from '@/hooks/useEntryWalls'
import { useNotificationsRealtime } from '@/hooks/useNotificationsRealtime'
import { useSessionsRealtime } from '@/hooks/useSessionsRealtime'
import { useSpaceAccessSync } from '@/hooks/useSpaceAccessSync'
import { useSpacesRealtime } from '@/hooks/useSpacesRealtime'
import { useUnseenRunsSync } from '@/hooks/useUnseenRunsSync'
import { useEnsureSandboxSpace } from '@/lib/sandbox/useEnsureSandboxSpace'
import { PhoneVerificationDialog } from '@lumvika/cloud/phone.client'
import { RewindViewer } from '@lumvika/cloud/rewind.client'
import { useBoardStore } from '@/stores/board.store'
import { selectStewardVisible, useStewardStore } from '@/stores/steward.store'
import { useSession } from '@/supabase/session/SessionProvider'
import { useAgentsRealtime } from '@/supabase/useAgentsRealtime'
import { useEffect, useRef } from 'react'

/**
 * What every page of the dashboard needs, whichever one the person is on: the workspace's board data
 * and its realtime feeds, the walls an account meets before the app opens, the Steward's orb, the
 * palette, and the dialogs the workspace and help menus open. Mounted once by the layout, inside the
 * frame, so the board page (HomeContent) keeps only what belongs to the board.
 */
export function DashboardRuntime() {
    const { user, workspace, loading } = useSession()
    const hydrated = useBoardStore(s => s.hydrated)
    const hydrate = useBoardStore(s => s.hydrate)
    const stewardVisible = useStewardStore(selectStewardVisible)
    const rewindEnabled = useRewindEnabled()
    const { phoneWallOpen, waitlistWallOpen } = useEntryWalls()

    const hydratedWorkspaceId = useRef<number | null>(null)
    useEffect(() => {
        if (!workspace) return
        if (hydratedWorkspaceId.current === workspace.id) return
        hydratedWorkspaceId.current = workspace.id
        useBoardStore.getState().reset()
        hydrate(workspace.id)
    }, [workspace, hydrate])

    useEnsureSandboxSpace()
    useAgentHealthSync(hydrated ? workspace?.id : undefined)
    useAgentSchedulesSync(hydrated ? workspace?.id : undefined)
    useAgentsRealtime(hydrated ? workspace?.id : undefined)
    useSpacesRealtime(hydrated ? workspace?.id : undefined)
    useSpaceAccessSync(hydrated ? workspace?.id : undefined)
    useSessionsRealtime(hydrated)
    useNotificationsRealtime(hydrated ? workspace?.id : undefined)
    useUnseenRunsSync(hydrated ? workspace?.id : undefined, user?.id)

    const ready = !loading

    return (
        <>
            {/* `fixed`, so where it is mounted does not move it; inside the frame, it reads the insets
                BoardChatSplit publishes. No machine outside the onboarding, no Steward. */}
            {ready && hydrated && stewardVisible && <StewardDock />}
            {/* Le mur du téléphone : il prend le relais dès que le compte existe, par quelque porte
                qu'il soit né, et ne tombe qu'une fois le numéro vérifié. */}
            {ready && <PhoneVerificationDialog open={phoneWallOpen} />}
            {/* Le mur de capacité : même mécanique, pour un compte créé alors que le pool d'engines
                est vide. Il tombe tout seul au chargement suivant où une machine est disponible. */}
            {ready && <EngineWaitlistDialog open={waitlistWallOpen} />}
            <WorkspaceDialogs />
            <ToolbarDialogs />
            {rewindEnabled && <RewindViewer />}
            <ChangelogDialog />
            <ControlCenter />
        </>
    )
}
