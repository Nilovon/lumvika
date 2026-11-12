'use client'

import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'

import { AssistantErrorNotice } from '@/components/assistant/AssistantErrorNotice'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { ChatActivityLoader } from '@/components/chat/ChatActivityLoader'
import { MessageView } from '@/components/chat/MessageView'
import type { ChatErrorKind } from '@/lib/chat-error'

// The answer is being written: its text shows the progress, a loader under it would only repeat it.
function writing(last: UIMessage | undefined): boolean {
    const tail = last?.role === 'assistant' ? last.parts.at(-1) : undefined
    return tail?.type === 'text' && tail.text.length > 0
}

type AssistantMessagesProps = {
    messages: UIMessage[]
    streaming: boolean
    error: { kind: ChatErrorKind; message: string } | null
    onStop: () => void
    onSwitchModel: () => void
    onOpenConnections: () => void
    onNewChat: () => void
    // In place of the stack while it is empty: the welcome, or a notice.
    empty?: ReactNode
}

export function AssistantMessages({ messages, streaming, error, onStop, onSwitchModel, onOpenConnections, onNewChat, empty }: AssistantMessagesProps) {
    if (messages.length === 0 && !error && !streaming && empty) return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{empty}</div>
    return (
        <Conversation className="relative min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-4 px-4 pt-6 pb-8">
                {messages.map((message, index) => (
                    <MessageView key={message.id} message={message} isActive={streaming && index === messages.length - 1} isLastAssistant={message.role === 'assistant' && index === messages.length - 1} copyable />
                ))}
                {streaming && !writing(messages.at(-1)) && <ChatActivityLoader message={messages.at(-1)} />}
                {error && (
                    <Message from="assistant">
                        <MessageContent>
                            <AssistantErrorNotice kind={error.kind} message={error.message} onStop={onStop} onSwitchModel={onSwitchModel} onOpenConnections={onOpenConnections} onNewChat={onNewChat} />
                        </MessageContent>
                    </Message>
                )}
            </ConversationContent>
            <ConversationScrollButton />
        </Conversation>
    )
}
