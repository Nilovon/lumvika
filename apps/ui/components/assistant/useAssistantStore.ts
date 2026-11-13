'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { create } from 'zustand'

import { loadAssistantHomeAction, type AssistantHome } from '@/app/api/_actions/assistant.actions'

// The Chat area's list, shared by the column and the conversation: a title written after the first
// message, a share or an archive made in the conversation's menu shows in the list at once.
type AssistantState = {
    home: AssistantHome | null
    loadError: string | null
    load: () => Promise<void>
    upsert: (chat: AssistantChat) => void
    remove: (chatId: string) => void
}

function place(home: AssistantHome, chat: AssistantChat): AssistantHome {
    const without = (list: AssistantChat[]) => list.filter(entry => entry.id !== chat.id)
    const ownedByMe = !home.shared.some(entry => entry.id === chat.id)
    if (!ownedByMe) return { ...home, shared: home.shared.map(entry => (entry.id === chat.id ? chat : entry)) }
    return chat.archivedAt ? { ...home, mine: without(home.mine), archived: [chat, ...without(home.archived)] } : { ...home, mine: [chat, ...without(home.mine)], archived: without(home.archived) }
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
    home: null,
    loadError: null,
    load: async () => {
        const result = await loadAssistantHomeAction().catch(() => null)
        if (result?.ok) set({ home: result.home, loadError: null })
        else set({ loadError: result?.error ?? 'generic' })
    },
    upsert: chat => {
        const { home } = get()
        if (home) set({ home: place(home, chat) })
    },
    remove: chatId => {
        const { home } = get()
        if (!home) return
        const keep = (list: AssistantChat[]) => list.filter(entry => entry.id !== chatId)
        set({ home: { ...home, mine: keep(home.mine), archived: keep(home.archived), shared: keep(home.shared) } })
    },
}))
