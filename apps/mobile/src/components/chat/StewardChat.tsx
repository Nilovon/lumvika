import { STEWARD_AGENT_ID, type AgentModels, type StewardSurface } from '@lumvika/contracts'
import * as Haptics from 'expo-haptics'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslations } from 'use-intl'

import { fetchStewardConversation, fetchStewardEngineFiles, fetchStewardSurface, type StewardConversation } from '@/api/steward'
import { fetchAgentModels } from '@/api/models'
import { useAuth } from '@/auth/AuthProvider'
import { takePendingAsk } from '@/chat/pending-ask'
import { stewardEndpoints } from '@/chat/endpoints'
import { useChatBack } from '@/components/layout/useChatBack'
import { StewardOrb } from '@/components/orb/StewardOrb'
import { AppText } from '@/components/ui/AppText'
import { PillButton } from '@/components/ui/PillButton'
import { environment, webHost } from '@/config/environment'
import { cachedSteward } from '@/data/local-cache'
import { useTheme } from '@/theme/theme'
import { spacing } from '@/theme/tokens'

import { CHAT_HEADER_HEIGHT, ChatHeader, type ChatTab } from './ChatHeader'
import { CONTROL } from './ComposerControls'
import { activePageIndex, conversationPages, type ConversationPage } from './conversation-pages'
import { ConversationPager } from './ConversationPager'
import { BLUR_ABOVE_FOOTER, ConversationPane, type ChatCoworker } from './ConversationPane'
import { ConversationSkeleton } from './ConversationSkeleton'
import { useOpenChats } from './useOpenChats'

// Opens the last conversation with the Steward, as the web column does.
export const LAST_CONVERSATION = 'last'

const STEWARD: Omit<ChatCoworker, 'role'> = { id: STEWARD_AGENT_ID, kind: 'steward', name: 'Lumvika', status: 'idle' }

const TITLE_DELAY_MS = 4000

type SurfaceState = StewardSurface | 'loading' | 'error'


const noop = () => {}

// Where the pane's transcript rests above its composer, so the conversation that replaces this
// skeleton lands where it already stood.
const COMPOSER_AREA = CONTROL + spacing.sm * 3 + BLUR_ABOVE_FOOTER

function LoadingConversation() {
    const insets = useSafeAreaInsets()
    return (
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.xl - 4, paddingTop: insets.top + CHAT_HEADER_HEIGHT + spacing.lg, paddingBottom: insets.bottom + COMPOSER_AREA }}>
            <ConversationSkeleton />
        </View>
    )
}

function Notice({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
    const insets = useSafeAreaInsets()
    const t = useTranslations('mobileChat.steward')
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: insets.top + CHAT_HEADER_HEIGHT, paddingBottom: insets.bottom + spacing.xxl }}>
            <StewardOrb size={64} />
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
                <AppText variant="title" style={{ textAlign: 'center' }}>
                    {title}
                </AppText>
                <AppText variant="callout" tone="muted" style={{ textAlign: 'center' }}>
                    {body}
                </AppText>
            </View>
            {onRetry && <PillButton label={t('retry')} variant="secondary" onPress={onRetry} />}
        </View>
    )
}

// The Steward of the workspace, the one running on its machine, on a page of its own like a coworker.
// The onboarding's lives on the web: a workspace still in it is sent there. `sessionId` is null for a
// new conversation, or `last` for the one the web column would show. A new one may open on the text
// the search left for it.
export function StewardChat({ sessionId }: { sessionId: string | null }) {
    const theme = useTheme()
    const t = useTranslations('mobileChat.steward')
    const steward = useMemo<ChatCoworker>(() => ({ ...STEWARD, role: t('role') }), [t])
    const back = useChatBack()
    const { session, me } = useAuth()
    const [ask] = useState(() => (sessionId === null ? takePendingAsk() : undefined))
    const [wantsLast] = useState(sessionId === LAST_CONVERSATION)
    // Where the last visit found the Steward, and its last conversation: the page opens on them.
    const [kept] = useState(() => (me ? cachedSteward(me.workspace.id).read() : null))
    const keptLast = kept?.surface === 'engine' ? kept.last : null
    const initialId = wantsLast ? (keptLast?.sessionId ?? null) : sessionId
    const [surface, setSurface] = useState<SurfaceState>(kept?.surface ?? 'loading')
    const [attempt, setAttempt] = useState(0)
    const [titles, setTitles] = useState<Record<string, string>>(() => (kept?.last?.title ? { [kept.last.sessionId]: kept.last.title } : {}))
    const [draftKey, setDraftKey] = useState(() => `new-${Date.now()}`)
    const [bornKeys, setBornKeys] = useState<Record<string, string>>({})
    const [activeId, setActiveId] = useState(initialId)
    const [models, setModels] = useState<AgentModels | null>(null)
    const [filesOnEngine, setFilesOnEngine] = useState(false)
    // Read by the pages' endpoints at upload time, long after the render that built them.
    const filesOnEngineRef = useRef(false)
    const [openIds, openChat] = useOpenChats(STEWARD_AGENT_ID, initialId)
    const accessToken = session?.access_token
    const workspaceId = me?.workspace.id
    const signedIn = Boolean(accessToken)

    // A refreshed token is not a new request: following it would remount the conversation and lose
    // its draft.
    const latestToken = useRef(accessToken)
    useEffect(() => {
        latestToken.current = accessToken
    }, [accessToken])

    const open = useCallback(
        (id: string) => {
            openChat(id)
            setActiveId(id)
            router.setParams({ id })
        },
        [openChat]
    )

    const showDraft = useCallback(() => {
        setActiveId(null)
        router.setParams({ id: 'new' })
    }, [])

    // The hub only tells the last conversation, with its title: null when there is none yet,
    // undefined when it could not be read.
    const readLastTitle = useCallback(
        (caller: { accessToken: string; workspaceId: number }): Promise<StewardConversation | null | undefined> =>
            fetchStewardConversation(caller)
                .then(last => {
                    if (last?.sessionId && last.title) setTitles(current => ({ ...current, [last.sessionId]: last.title as string }))
                    return last
                })
                .catch(() => undefined),
        []
    )

    useEffect(() => {
        const token = latestToken.current
        if (!signedIn || !token || !workspaceId) return
        const caller = { accessToken: token, workspaceId }
        let cancelled = false
        const lastConversation = readLastTitle(caller)
        fetchStewardSurface(caller)
            .then(async next => {
                const last = next === 'engine' ? await lastConversation : null
                if (cancelled) return
                if (next === 'engine' && wantsLast) {
                    if (last?.sessionId) {
                        if (last.sessionId !== keptLast?.sessionId) open(last.sessionId)
                    } else if (last === null && keptLast) showDraft()
                    else if (!keptLast) router.setParams({ id: 'new' })
                }
                // A last conversation that could not be read keeps the one the phone knew; the hub
                // answering that there is none forgets it.
                const remembered = last === undefined ? (kept?.last ?? null) : last?.sessionId ? { sessionId: last.sessionId, title: last.title ?? null } : null
                cachedSteward(workspaceId).save({ surface: next, last: remembered })
                setSurface(next)
            })
            // Offline, the page stays on what the phone knew.
            .catch(() => {
                if (!cancelled) setSurface(current => (kept && current !== 'loading' ? current : 'error'))
            })
        return () => {
            cancelled = true
        }
    }, [signedIn, workspaceId, wantsLast, attempt, readLastTitle, open, showDraft, kept, keptLast])

    // Read again when the model sheet closes on a new pick, as a coworker's page does.
    useFocusEffect(
        useCallback(() => {
            const token = latestToken.current
            if (surface !== 'engine' || !token || !workspaceId) return
            fetchAgentModels({ accessToken: token, workspaceId }, STEWARD_AGENT_ID)
                .then(setModels)
                .catch(() => {})
        }, [surface, workspaceId])
    )

    useEffect(() => {
        const token = latestToken.current
        if (surface !== 'engine' || !token || !workspaceId) return
        let cancelled = false
        fetchStewardEngineFiles({ accessToken: token, workspaceId })
            .then(supported => {
                if (cancelled) return
                filesOnEngineRef.current = supported
                setFilesOnEngine(supported)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [surface, workspaceId])

    const makeEndpoints = useCallback(() => stewardEndpoints(() => filesOnEngineRef.current), [])

    const select = (id: string) => {
        Haptics.selectionAsync()
        open(id)
    }

    const startNew = () => {
        Haptics.selectionAsync()
        showDraft()
    }

    // Born from its first send: the page stays and becomes a tab, and a fresh draft ends the row. The
    // hub titles it from its first message, a moment after it answers the send.
    const onSessionCreated = useCallback(
        (id: string) => {
            setBornKeys(known => ({ ...known, [id]: draftKey }))
            setDraftKey(`new-${Date.now()}`)
            open(id)
            if (accessToken && workspaceId) setTimeout(() => readLastTitle({ accessToken, workspaceId }), TITLE_DELAY_MS)
        },
        [draftKey, open, accessToken, workspaceId, readLastTitle]
    )

    const pages = conversationPages(openIds, bornKeys, draftKey)
    const activeIndex = activePageIndex(pages, activeId)
    const progress = useSharedValue(activeIndex)

    const settleOn = (index: number) => {
        const sessionAt = pages[index]?.sessionId
        if (sessionAt === undefined) return
        if (sessionAt) open(sessionAt)
        else showDraft()
    }

    const tabs = openIds.map((id): ChatTab => ({ id, title: titles[id] ?? null, running: false, empty: false }))

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            {surface === 'loading' && <LoadingConversation />}
            {surface === 'engine' && <ConversationPager pages={pages} activeIndex={activeIndex} progress={progress} onSettle={settleOn} renderPage={(page: ConversationPage, onScreen) => <ConversationPane coworker={steward} makeEndpoints={makeEndpoints} initialSessionId={page.sessionId} onSessionCreated={onSessionCreated} models={models} status={null} onStatusChange={noop} webUrl={`${environment.apiUrl}/`} onScreen={onScreen} initialMessage={page.sessionId ? undefined : ask} canAttach={filesOnEngine} />} />}
            {(surface === 'onboarding' || surface === 'none') && <Notice title={t(`away.${surface}.title`)} body={t(`away.${surface}.body`, { host: webHost })} />}
            {surface === 'error' && (
                <Notice
                    title={t('unreachableTitle')}
                    body={t('unreachableBody')}
                    onRetry={() => {
                        setSurface('loading')
                        setAttempt(current => current + 1)
                    }}
                />
            )}
            <ChatHeader coworker={steward} tabs={surface === 'engine' ? tabs : []} activeId={activeId ?? undefined} progress={progress} allSessions={surface === 'engine' ? tabs : []} onBack={back} onSelect={select} onNewSession={startNew} />
        </View>
    )
}
