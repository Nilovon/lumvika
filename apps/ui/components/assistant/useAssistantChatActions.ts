'use client'

import type { AssistantChat, UpdateAssistantChatInput } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { toast } from 'sonner'

import { archiveAssistantChatAction, deleteAssistantChatAction, updateAssistantChatAction } from '@/app/api/_actions/assistant.actions'
import { useAssistantStore } from '@/components/assistant/useAssistantStore'
import { useErrorText } from '@/hooks/useErrorText'

// What stayed on the server is worth the time to read it.
const KEPT_NOTICE_MS = 12_000

// What the owner of a chat does to it, from the list or from the conversation. `onGone` runs when the
// chat leaves the list (archived or deleted), so the screen can stop showing it.
export function useAssistantChatActions(onGone?: (chatId: string) => void) {
    const t = useTranslations('assistant.toasts')
    const errorText = useErrorText()
    const upsert = useAssistantStore(state => state.upsert)
    const remove = useAssistantStore(state => state.remove)

    const update = useCallback(
        async (chat: AssistantChat, input: UpdateAssistantChatInput): Promise<AssistantChat | null> => {
            const result = await updateAssistantChatAction(chat.id, input)
            if (!result.ok) {
                toast.error(errorText(result))
                return null
            }
            upsert(result.chat)
            return result.chat
        },
        [errorText, upsert]
    )

    const toggleShare = useCallback(
        async (chat: AssistantChat) => {
            const updated = await update(chat, { shared: !chat.shared })
            if (updated) toast.success(updated.shared ? t('shared') : t('unshared'))
        },
        [update, t]
    )

    const archive = useCallback(
        async (chat: AssistantChat, archived: boolean) => {
            const result = await archiveAssistantChatAction(chat.id, archived)
            if (!result.ok) return void toast.error(errorText(result))
            upsert(result.chat)
            toast.success(archived ? t('archived') : t('restored'))
            if (archived) onGone?.(chat.id)
        },
        [errorText, upsert, onGone, t]
    )

    const destroy = useCallback(
        async (chat: AssistantChat): Promise<boolean> => {
            const result = await deleteAssistantChatAction(chat.id)
            if (!result.ok) {
                toast.error(errorText(result))
                return false
            }
            remove(chat.id)
            if (result.transcript === 'outdated') toast.warning(t('deletedOutdated'), { duration: KEPT_NOTICE_MS })
            else if (result.transcript === 'unreachable') toast.warning(t('deletedUnreachable'), { duration: KEPT_NOTICE_MS })
            else toast.success(t('deleted'))
            onGone?.(chat.id)
            return true
        },
        [errorText, remove, onGone, t]
    )

    return { update, toggleShare, archive, destroy }
}
