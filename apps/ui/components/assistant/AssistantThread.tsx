'use client'

import { ASSISTANT_AGENT_ID, type AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createAssistantChatAction, type AssistantProjectOption, type OpenedAssistantChat } from '@/app/api/_actions/assistant.actions'
import { AssistantComposer } from '@/components/assistant/AssistantComposer'
import { AssistantConversationHeader } from '@/components/assistant/AssistantConversationHeader'
import { AssistantEmptyState } from '@/components/assistant/AssistantEmptyState'
import { AssistantMessages } from '@/components/assistant/AssistantMessages'
import { AssistantProjectPicker } from '@/components/assistant/AssistantProjectPicker'
import { AssistantStateNotice, type AssistantBlocker } from '@/components/assistant/AssistantStateNotice'
import { useAssistantChat } from '@/components/assistant/useAssistantChat'
import { useAssistantChatActions } from '@/components/assistant/useAssistantChatActions'
import { useAssistantStore } from '@/components/assistant/useAssistantStore'
import type { ChatComposerHandle } from '@/components/chat/ChatComposer'
import { readAgentModel, writeAgentModel } from '@/hooks/useAgentModel'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { useErrorText } from '@/hooks/useErrorText'
import { classifyChatError, unwrapChatError } from '@/lib/chat-error'
import { ArrowLeftIcon } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { useModelPickerStore } from '@/stores/model-picker.store'
import { selectStewardOpen, selectStewardVisible, useStewardStore } from '@/stores/steward.store'
import { useWorkspaceSettingsStore } from '@/stores/workspace-settings.store'
import { cn } from '@/lib/utils'

const SERVER_BLOCKERS: Record<string, AssistantBlocker> = { engine_outdated: 'outdated', no_engine: 'no_engine', engine_unreachable: 'unreachable' }

const DRAFT_SELECTION = 'assistant-chat:draft'
const TITLE_SETTLE_MS = 4_000
const selectionKeyOf = (chatId: string) => `assistant-chat:${chatId}`

type AssistantThreadProps = {
    // Null for a chat not started yet: it is created by its first message.
    opened: OpenedAssistantChat | null
    projects: AssistantProjectOption[]
    isAdmin: boolean
    onCreated: (chat: AssistantChat) => void
    onBack: () => void
    onNew: () => void
    onGone: (chatId: string) => void
}

// One conversation with the assistant: its header, the messages and the composer, or what stands in
// for the composer (a chat shared to read, no model to answer with).
export function AssistantThread({ opened, projects, isAdmin, onCreated, onBack, onNew, onGone }: AssistantThreadProps) {
    const t = useTranslations('assistant')
    const errorText = useErrorText()
    const instanceId = useId()
    const composerRef = useRef<ChatComposerHandle | null>(null)
    const [createdChat, setCreatedChat] = useState<AssistantChat | null>(null)
    const [draftProjectId, setDraftProjectId] = useState<string | null>(null)

    const baseChat = opened?.chat ?? createdChat
    const stored = useAssistantStore(state => (baseChat ? [...(state.home?.mine ?? []), ...(state.home?.archived ?? []), ...(state.home?.shared ?? [])].find(chat => chat.id === baseChat.id) : undefined))
    const chat = stored ?? baseChat
    const access = opened?.access ?? 'owner'
    const owner = access === 'owner'
    const reload = useAssistantStore(state => state.load)
    const { update } = useAssistantChatActions(onGone)

    // The pick is kept per chat; a chat not started yet uses the draft's, the last one picked for a
    // new chat, and keeps it once it has an id.
    const [selectionKey] = useState(() => (opened ? selectionKeyOf(opened.chat.id) : DRAFT_SELECTION))

    const ensureChat = useCallback(async () => {
        const selection = readAgentModel(selectionKey)
        const result = await createAssistantChatAction({ projectId: draftProjectId, model: selection.model ?? null })
        if (!result.ok) {
            toast.error(errorText(result))
            return null
        }
        writeAgentModel(selectionKeyOf(result.chat.id), selection)
        setCreatedChat(result.chat)
        onCreated(result.chat)
        return result.chat.id
    }, [draftProjectId, errorText, onCreated, selectionKey])

    const { messages, status, error, send, stop, stopping, preparing } = useAssistantChat({
        instanceId,
        chatId: chat?.id ?? null,
        selectionKey,
        initialMessages: opened?.messages ?? [],
        activeRunId: opened?.activeRunId ?? null,
        ensureChat,
        // The title is written once the answer is out, so the list is read again a little later too.
        onTurnEnd: () => {
            void reload()
            window.setTimeout(() => void reload(), TITLE_SETTLE_MS)
        },
    })

    const busy = status === 'submitted' || status === 'streaming' || stopping || preparing
    const streaming = status === 'submitted' || status === 'streaming'

    // The route's own refusals about the server say what to do about the server, not about the model.
    const serverBlocker = useMemo(() => SERVER_BLOCKERS[unwrapChatError(error?.message) as keyof typeof SERVER_BLOCKERS] ?? null, [error])
    const displayedError = useMemo(() => {
        const text = error ? unwrapChatError(error.message) : messages.length && !streaming ? (opened?.lastError ?? null) : null
        return text && !serverBlocker ? { kind: classifyChatError(text), message: text } : null
    }, [error, messages.length, streaming, opened?.lastError, serverBlocker])

    const sendText = useCallback(
        (text: string) => {
            void send(text).then(sent => {
                if (!sent) composerRef.current?.restore(text)
            })
        },
        [send]
    )

    const openAiProviders = useWorkspaceSettingsStore(state => state.openAiProviders)
    // The Steward parked in the bottom corner sits over the send button: the composer makes room.
    const stewardParked = useStewardStore(state => selectStewardVisible(state) && !selectStewardOpen(state))
    const requestModelPicker = useModelPickerStore(state => state.request)
    const { availableGroups, loading: modelsLoading } = useAvailableModels(ASSISTANT_AGENT_ID)
    const noProvider = owner && !modelsLoading && availableGroups.length === 0

    const projectChip = (
        <AssistantProjectPicker projects={projects} value={draftProjectId} onChange={setDraftProjectId} />
    )

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {chat ? (
                <AssistantConversationHeader chat={chat} access={access} projects={projects} onBack={onBack} onProjectChange={projectId => void update(chat, { projectId })} onGone={onGone} />
            ) : (
                <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 @2xl:hidden">
                    <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t('conversation.back')} title={t('conversation.back')} className="-ml-1 text-muted-foreground">
                        <ArrowLeftIcon className="size-4" />
                    </Button>
                    <h2 className="truncate text-sm font-medium">{t('list.new')}</h2>
                </div>
            )}
            {opened?.transcriptUnavailable && <p className="shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">{t('conversation.transcriptUnavailable')}</p>}
            {serverBlocker || noProvider ? (
                <AssistantStateNotice blocker={serverBlocker ?? 'no_provider'} onRetry={() => void reload()} />
            ) : (
                <AssistantMessages
                    messages={messages}
                    streaming={streaming}
                    error={displayedError}
                    onStop={() => void stop()}
                    onSwitchModel={() => requestModelPicker(selectionKey)}
                    onOpenConnections={() => openAiProviders()}
                    onNewChat={onNew}
                    empty={owner ? <AssistantEmptyState onSend={sendText} onPrefill={text => composerRef.current?.restore(text)} /> : undefined}
                />
            )}
            <div className={cn('shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] @2xl:px-4', stewardParked && 'pr-14')}>
                <div className="mx-auto w-full max-w-3xl">
                    {owner ? (
                        !noProvider && <AssistantComposer uid={`assistant-${opened?.chat.id ?? 'draft'}`} selectionKey={selectionKey} isAdmin={isAdmin} status={status} busy={busy} onSend={sendText} onStop={() => void stop()} composerRef={composerRef} leading={chat ? undefined : projectChip} />
                    ) : (
                        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{t('conversation.readOnly', { name: opened?.ownerName || t('list.someone') })}</p>
                    )}
                </div>
            </div>
        </div>
    )
}
