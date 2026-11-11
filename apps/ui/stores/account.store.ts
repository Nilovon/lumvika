import { create } from 'zustand'

export type AccountTab = 'profile' | 'sign-in' | 'language' | 'delete'

type AccountState = {
    open: boolean
    tab: AccountTab
    openAccount: (tab?: AccountTab) => void
    setOpen: (open: boolean) => void
    setTab: (tab: AccountTab) => void
}

export const useAccountStore = create<AccountState>(set => ({
    open: false,
    tab: 'profile',
    openAccount: tab => set({ open: true, tab: tab ?? 'profile' }),
    setOpen: open => set({ open }),
    setTab: tab => set({ tab }),
}))
