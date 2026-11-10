import { create } from 'zustand'

type ShortcutsState = {
    open: boolean
    openShortcuts: () => void
    setOpen: (open: boolean) => void
}

export const useShortcutsStore = create<ShortcutsState>(set => ({
    open: false,
    openShortcuts: () => set({ open: true }),
    setOpen: open => set({ open }),
}))
