'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { readAssistantMessagesAction } from '@/app/api/_actions/assistant.actions'
import { readAgentModel } from '@/hooks/useAgentModel'
import { lastUserText } from '@/lib/chat-payload'

type UseAssistantChatOptions = {
    // One per conversation pane: it outlives the moment a chat not started yet gets its id.
    instanceId: string
    chatId: string | null
    selectionKey: string
    initialMessages: UIMessage[]
    activeRunId: string | null
    // Creates the chat on its first message; the pane names it from then on.
    ensureChat: () => Promise<string | null>
    onTurnEnd: () => void
}

// The assistant's chat on the engine, through /api/chat/assistant: only the message being sent
// travels, the engine holds the conversation. A run still going when the chat opens is followed from
// its start, and the transcript is read again once it ends so nothing the replay got wrong stays.
export function useAssistantChat({ instanceId, chatId, selectionKey, initialMessages, activeRunId, ensureChat, onTurnEnd }: UseAssistantChatOptions) {
    const chatIdRef = useRef(chatId)
    useEffect(() => {
        chatIdRef.current = chatId
    }, [chatId])

    // Only a chat that already had its id when it opened can have a run to follow.
    const [openedChatId] = useState(chatId)
    const transport = useMemo(
        () =>
            new DefaultChatTransport<UIMessage>({
                api: '/api/chat/assistant',
                prepareSendMessagesRequest: ({ body, messages }) => ({ body: { ...body, text: lastUserText(messages) } }),
                prepareReconnectToStreamRequest: () => ({ api: `/api/chat/assistant/resume?chatId=${encodeURIComponent(openedChatId ?? '')}` }),
            }),
        [openedChatId]
    )

    const chat = useChat<UIMessage>({
        id: instanceId,
        messages: initialMessages,
        transport,
        experimental_throttle: 80,
        // A failed turn names its chat too: the title is written whether the model answered or not.
        onFinish: ({ isAbort }) => {
            if (!isAbort) onTurnEnd()
        },
    })
    const { setMessages } = chat

    const reconcile = useCallback(async () => {
        if (!openedChatId) return
        const messages = await readAssistantMessagesAction(openedChatId).catch(() => [])
        if (messages.length) setMessages(messages)
    }, [openedChatId, setMessages])

    const { resumeStream, sendMessage, stop: stopStream, clearError } = chat

    const followed = useRef(false)
    useEffect(() => {
        if (!activeRunId || followed.current) return
        followed.current = true
        void resumeStream()
            .catch(() => {})
            .then(reconcile)
    }, [activeRunId, resumeStream, reconcile])

    const [preparing, setPreparing] = useState(false)
    const send = useCallback(
        async (text: string): Promise<boolean> => {
            clearError()
            if (!chatIdRef.current) {
                setPreparing(true)
                const id = await ensureChat().finally(() => setPreparing(false))
                if (!id) return false
                chatIdRef.current = id
            }
            // Read at send time: a model picked in the composer reaches the very next message.
            void sendMessage({ text }, { body: { chatId: chatIdRef.current, ...readAgentModel(selectionKey) } })
            return true
        },
        [clearError, ensureChat, sendMessage, selectionKey]
    )

    // Closing the stream alone would leave the engine run going, still answering nobody.
    const [stopping, setStopping] = useState(false)
    const stop = useCallback(async () => {
        setStopping(true)
        try {
            await stopStream()
            const id = chatIdRef.current
            if (id) await fetch(`/api/chat/assistant?chatId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
        } finally {
            setStopping(false)
        }
    }, [stopStream])

    return { ...chat, send, stop, stopping, preparing }
}
