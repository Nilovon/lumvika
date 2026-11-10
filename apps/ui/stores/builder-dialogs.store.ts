import { create } from 'zustand'

// The creation dialogs of the board, opened from its toolbar and from the control center alike.
type BuilderDialogsState = {
    newAgentOpen: boolean
    libraryOpen: boolean
    // A template the library is asked to open on, rather than on its gallery.
    librarySlug: string | null
    newBoxOpen: boolean
    openNewAgent: () => void
    setNewAgentOpen: (open: boolean) => void
    openLibrary: (slug?: string) => void
    setLibraryOpen: (open: boolean) => void
    setNewBoxOpen: (open: boolean) => void
}

export const useBuilderDialogsStore = create<BuilderDialogsState>(set => ({
    newAgentOpen: false,
    libraryOpen: false,
    librarySlug: null,
    newBoxOpen: false,
    openNewAgent: () => set({ newAgentOpen: true, libraryOpen: false }),
    setNewAgentOpen: newAgentOpen => set({ newAgentOpen }),
    openLibrary: slug => set({ libraryOpen: true, librarySlug: slug ?? null, newAgentOpen: false }),
    setLibraryOpen: libraryOpen => set({ libraryOpen }),
    setNewBoxOpen: newBoxOpen => set({ newBoxOpen }),
}))
