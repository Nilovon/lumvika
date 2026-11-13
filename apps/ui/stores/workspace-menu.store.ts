import { create } from 'zustand'
import type { PowerAction } from '@/components/layout/WorkspacePowerControl'

// The dialogs the workspace menu opens without a store of their own. They are mounted once, by
// WorkspaceDialogs, while the menu itself has a trigger in the sidebar, the drawer and on the board.
type WorkspaceMenuState = {
    createOpen: boolean
    serversOpen: boolean
    profileOpen: boolean
    powerAction: PowerAction | null
    setCreateOpen: (open: boolean) => void
    setServersOpen: (open: boolean) => void
    setProfileOpen: (open: boolean) => void
    setPowerAction: (action: PowerAction | null) => void
}

export const useWorkspaceMenuStore = create<WorkspaceMenuState>(set => ({
    createOpen: false,
    serversOpen: false,
    profileOpen: false,
    powerAction: null,
    setCreateOpen: createOpen => set({ createOpen }),
    setServersOpen: serversOpen => set({ serversOpen }),
    setProfileOpen: profileOpen => set({ profileOpen }),
    setPowerAction: powerAction => set({ powerAction }),
}))
