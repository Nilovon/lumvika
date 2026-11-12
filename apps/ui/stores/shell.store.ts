import { create } from 'zustand'
import { rememberSidebarCollapsed } from '@/lib/shell/sidebar-state'

type ShellState = {
    // `null` until the person toggles it or the stored preference is read: the cookie the server
    // rendered with stands until then.
    sidebarCollapsed: boolean | null
    drawerOpen: boolean
    restoreSidebarCollapsed: (collapsed: boolean | null) => void
    setSidebarCollapsed: (collapsed: boolean) => void
    setDrawerOpen: (open: boolean) => void
}

export const useShellStore = create<ShellState>(set => ({
    sidebarCollapsed: null,
    drawerOpen: false,
    restoreSidebarCollapsed: collapsed => set(state => (state.sidebarCollapsed === null && collapsed !== null ? { sidebarCollapsed: collapsed } : state)),
    setSidebarCollapsed: collapsed => {
        rememberSidebarCollapsed(collapsed)
        set({ sidebarCollapsed: collapsed })
    },
    setDrawerOpen: open => set({ drawerOpen: open }),
}))
