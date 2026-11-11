'use client'

import {
    isWorkspaceMemberAction,
    readMemberWorkspacesAction,
    readSessionUserAction,
    readSignupStampAction,
    readWorkspaceAction,
    readWorkspaceAnswersAction,
    readWorkspaceRoleAction,
} from '@/app/api/_actions/session-provider-reads.actions'
import { Database } from '@/app/api/database.types'
import { isAdminEmail } from '@/lib/auth/admin-emails'
import { authClient } from '@/lib/auth/auth-client'
import { isAnonymousAccountEmail } from '@/lib/auth/placeholder-email'
import { awaitSignupStamp } from '@/lib/auth/session/signup-stamp'
import { routes } from '@/lib/routes'
import { parsePriceArm, PRICE_EXPERIMENT_KEY, PRICE_PROPERTY, isSubscriptionEntitled, TRIAL_CARD_PROPERTY, trialArm } from '@lumvika/cloud/billing'
import { useBoardStore } from '@/stores/board.store'
import { useStewardStore } from '@/stores/steward.store'
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'
import { enterActiveWorkspace, isWorkspaceSwitchInFlight } from '@/lib/workspace/workspace-switch'
import { clearTabWorkspace, installWorkspaceHeader, pinTabWorkspace, readTabWorkspace, readUrlWorkspace } from '@/lib/workspace/tab-workspace'
import { track, readAttribution, getCookie, identifyPerson, setSharedCookie, deleteSharedCookie } from '@lumvika/analytics/client'
import { experimentProperties, readExperimentCookie, STALE_EXPERIMENT_PROPERTIES, writeExperimentVariants } from '@lumvika/analytics/experiments'
import { SIGNUP_INTENT_COOKIE, type SignupMethod } from '@lumvika/analytics'
import { clearSessionHintCookie, readConsentCookie, reportAffiliateSignup } from '@lumvika/contracts'
import posthog from 'posthog-js'
import { useRouter } from 'next/navigation'
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Workspace = Pick<
    Database['public']['Tables']['workspaces']['Row'],
    | 'id'
    | 'name'
    | 'icon_url'
    | 'plan'
    | 'stripe_customer_id'
    | 'max_agents'
    | 'max_seats'
    | 'model_access'
    | 'custom_integrations'
    | 'subscription_status'
    | 'current_period_end'
    | 'trial_ends_at'
    | 'lumvika_used_micros'
    | 'lumvika_budget_micros'
    | 'lumvika_topup_micros'
    | 'lumvika_period_anchor'
    | 'lumvika_credit_paused_at'
    | 'is_sandbox'
    | 'onboarded_at'
    | 'boxes_archived_at'
    | 'price_arm'
    | 'locale'
>
type User = Pick<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'workspace_id' | 'email_notification_prefs' | 'account_role' | 'expert_profile_id' | 'signed_up_at' | 'locale'>
type WorkspaceAnswers = Database['public']['Tables']['workspace_onboarding']['Row']['answers']
export type WorkspaceRole = Database['public']['Enums']['workspace_role']
export type BoxScope = 'all' | 'assigned'

// The person behind the tab as the auth layer knows them. `email` is null for an anonymous visitor,
// whose row only holds a placeholder.
export type SessionUser = { id: string; email: string | null; name: string; image: string | null; isAnonymous: boolean }
export type Session = { user: SessionUser }

function toBoxScope(value: string | null | undefined): BoxScope {
    return value === 'assigned' ? 'assigned' : 'all'
}

const FRESH_SIGNUP_MS = 60 * 60 * 1000

installWorkspaceHeader()

export type SessionContextValue = {
    user: User | null
    workspace: Workspace | null
    // What the workspace's onboarding learned about the company (industry, tools…). Read once per
    // workspace and again when it is stamped onboarded, rather than streamed: it is only ever read
    // to pre-filter suggestions.
    workspaceAnswers: WorkspaceAnswers | null
    // The caller's role in the tab's workspace, `null` until it is read.
    role: WorkspaceRole | null
    // Whether the caller uses every Box open to the workspace or only the ones named to them,
    // `null` until it is read. Meaningless for an admin, who reaches every Box.
    boxScope: BoxScope | null
    workspaces: Workspace[]
    session: Session | null
    isAnonymous: boolean
    // False in the gap between an account being born and its signup stamp reaching this tab: nothing
    // may start on its own until it is settled. Always true for an anonymous visitor.
    signupSettled: boolean
    loading: boolean
    signOut: () => Promise<void>
    // On-demand re-read of the workspace row, for a caller that just changed it server-side and
    // cannot wait on the realtime channel.
    refreshWorkspace: () => Promise<void>
    // Same for the session and the `users` row: the signup form calls it once the server has
    // stamped the signup, the account dialog once the name or the photo changed.
    refreshUser: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

type AuthSessionUser = { id: string; email: string; name: string; image?: string | null; isAnonymous?: boolean | null }

function toSessionUser(user: AuthSessionUser): SessionUser {
    const isAnonymous = !!user.isAnonymous || isAnonymousAccountEmail(user.email)
    return { id: user.id, email: isAnonymous ? null : user.email, name: user.name, image: user.image ?? null, isAnonymous }
}

export function SessionProvider({ children }: PropsWithChildren) {
    const [user, setUser] = useState<User | null>(null)
    const [workspace, setWorkspace] = useState<Workspace | null>(null)
    const [loadedAnswers, setLoadedAnswers] = useState<{ workspaceId: number; answers: WorkspaceAnswers | null } | null>(null)
    const [loadedRole, setLoadedRole] = useState<{ workspaceId: number; role: WorkspaceRole; boxScope: BoxScope } | null>(null)
    const [roleReads, setRoleReads] = useState(0)
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [userLoading, setUserLoading] = useState(true)
    const [workspaceLoading, setWorkspaceLoading] = useState(true)
    const authSession = authClient.useSession()
    const router = useRouter()
    const sessionUserId = useRef<string | null>(null)
    const userReadSeq = useRef(0)
    const loadedWorkspaceRef = useRef<{ userId: string; workspaceId: number } | null>(null)
    const storedWorkspaceIdRef = useRef<number | null>(null)

    const authUser = authSession.data?.user as AuthSessionUser | undefined
    const sessionUser = useMemo(() => (authUser ? toSessionUser(authUser) : null), [authUser?.id, authUser?.email, authUser?.name, authUser?.image, authUser?.isAnonymous])
    const session = useMemo<Session | null>(() => (sessionUser ? { user: sessionUser } : null), [sessionUser])
    const isAnonymous = sessionUser?.isAnonymous ?? false
    const nextUserId = sessionUser?.id ?? null

    // The `users` row follows the session. Signing into an existing account swaps the account under
    // the app: the `users` row and the workspace still in hand belong to the anonymous visitor being
    // left behind, and the fetch that replaces them is asynchronous. Dropping them here, loading
    // flags included, is what keeps everything reading the session from deciding on that stale
    // identity in between: an empty workspace whose onboarding was never completed, which is what
    // replayed the survey to someone who had done it long ago. An in-place upgrade (email sign-up,
    // Google linking) keeps the same id and is left untouched.
    useEffect(() => {
        if (authSession.isPending) return
        const previousUserId = sessionUserId.current
        sessionUserId.current = nextUserId
        const signedOut = previousUserId !== null && nextUserId === null
        const switchedAccount = previousUserId !== null && nextUserId !== null && nextUserId !== previousUserId
        if (switchedAccount) {
            setUser(null)
            setUserLoading(true)
            setWorkspace(null)
            setWorkspaceLoading(true)
            useBoardStore.getState().reset()
            useStewardStore.getState().reset()
            clearTabWorkspace()
            // Every event until the new workspace loads would otherwise carry the one left behind.
            posthog.unregister('workspace_id')
        }
        if (signedOut) {
            useBoardStore.getState().reset()
            clearTabWorkspace()
            posthog.reset()
            // The middleware clears it too, but the navigation that follows a sign-out can be
            // served from the router cache without ever reaching it, and the landing would keep
            // offering a dashboard to someone who just left.
            clearSessionHintCookie()
            setUser(null)
            setWorkspace(null)
            setWorkspaces([])
        }
        void fetchUser()
    }, [authSession.isPending, nextUserId, isAnonymous])

    // Keyed on what the read depends on, not on the row object: every realtime update of `users`
    // hands a new object, and each one used to re-read the workspace. `user.workspace_id` is the
    // tab's own workspace, which a switch made in another tab leaves alone. Should it still move,
    // the app reloads like any switch: swapping the context alone would leave every cache and
    // store on the previous workspace.
    useEffect(() => {
        if (!user?.workspace_id) return
        const loaded = loadedWorkspaceRef.current
        if (loaded?.userId === user.id && loaded.workspaceId !== user.workspace_id) {
            if (!isWorkspaceSwitchInFlight()) enterActiveWorkspace()
            return
        }
        loadedWorkspaceRef.current = { userId: user.id, workspaceId: user.workspace_id }
        pinTabWorkspace(user.workspace_id)
        void fetchWorkspace()
    }, [user?.id, user?.workspace_id])

    useEffect(() => {
        if (user?.id) {
            void fetchWorkspaces()
        }
    }, [user?.id])

    const workspaceId = workspace?.id ?? null
    const memberId = user?.id ?? null
    const role = loadedRole && loadedRole.workspaceId === workspaceId ? loadedRole.role : null
    const boxScope = loadedRole && loadedRole.workspaceId === workspaceId ? loadedRole.boxScope : null
    useEffect(() => {
        if (!memberId || workspaceId === null) return
        let cancelled = false
        void readWorkspaceRoleAction(workspaceId).then(data => {
            if (!cancelled && data) setLoadedRole({ workspaceId, role: data.role, boxScope: toBoxScope(data.box_scope) })
        })
        return () => {
            cancelled = true
        }
    }, [memberId, workspaceId, roleReads])

    // Keyed by workspace so a switch never shows the previous workspace's answers while the new ones load.
    const workspaceAnswers = loadedAnswers && loadedAnswers.workspaceId === workspaceId ? loadedAnswers.answers : null
    useEffect(() => {
        if (workspaceId === null) return
        let cancelled = false
        void readWorkspaceAnswersAction(workspaceId).then(answers => {
            if (!cancelled) setLoadedAnswers({ workspaceId, answers })
        })
        return () => {
            cancelled = true
        }
    }, [workspaceId, workspace?.onboarded_at])

    // `is_internal` lets PostHog filter the team out of every funnel, and the $set_once UTMs
    // freeze first-touch attribution on the person even when the event-level cookie is gone.
    const email = sessionUser?.email ?? null
    useEffect(() => {
        if (email) {
            const attribution = readAttribution()
            identifyPerson(
                email,
                { email, is_internal: isAdminEmail(email) },
                {
                    initial_utm_source: attribution.utm_source,
                    initial_utm_campaign: attribution.utm_campaign,
                    initial_referrer_domain: attribution.referrer_domain,
                },
            )
        }
    }, [email])

    // Super property: every client event carries the workspace it happened in, which is the id
    // Stripe metadata and the server-side lifecycle events are keyed on. Cleared by
    // posthog.reset() on sign-out.
    useEffect(() => {
        if (workspace?.id) posthog.register({ workspace_id: workspace.id })
    }, [workspace?.id])

    // Le bras du test A/B est tiré sur la landing et vit dans le cookie `lumvika-ab`, posé sur
    // `.lumvika.com` : le relire ici est ce qui fait porter le bras aux events de l'app, du signup
    // jusqu'à l'activation. S'en remettre à la propagation des super-properties de PostHog ne
    // suffirait pas, sa persistance est `localStorage+cookie` et le localStorage ne traverse pas les
    // sous-domaines. Rejoué à chaque changement d'identité, parce que `posthog.reset()` les efface.
    useEffect(() => {
        for (const stale of STALE_EXPERIMENT_PROPERTIES) posthog.unregister(stale)
        const properties = experimentProperties(readExperimentCookie())
        if (Object.keys(properties).length > 0) posthog.register(properties)
    }, [nextUserId])

    // Once there is a workspace, its price is the one the column froze, not the cookie's: a second
    // device or an invited teammate carries another draw, or none. The cookie is brought back in line
    // so the landing quotes the same price, and the arm goes on the person as well as on the events:
    // the billing events are sent by the server, which has no super property to carry it.
    //
    // A workspace from before the test has no arm and is left out: nothing is written for it, nor
    // for a visitor who has since refused the cookie.
    const priceArm = workspace?.price_arm ? parsePriceArm(workspace.price_arm) : null
    useEffect(() => {
        if (!priceArm || readConsentCookie() === 'denied') return
        const variants = readExperimentCookie()
        if (variants[PRICE_EXPERIMENT_KEY] !== priceArm) writeExperimentVariants({ ...variants, [PRICE_EXPERIMENT_KEY]: priceArm })
        posthog.register({ [PRICE_PROPERTY]: priceArm })
        posthog.setPersonProperties({ [PRICE_PROPERTY]: priceArm })
    }, [priceArm, nextUserId])

    // The trial test is drawn from the workspace, so only a workspace still facing the offer is
    // enrolled. The person property, set once, is what splits the server-side events
    // (`trial_started`, `subscription_started`), which carry no super property.
    const trialTestArm = workspace && !workspace.trial_ends_at && !workspace.is_sandbox && !isSubscriptionEntitled(workspace.subscription_status) ? trialArm(workspace.id) : null
    useEffect(() => {
        if (!trialTestArm) return
        posthog.register({ [TRIAL_CARD_PROPERTY]: trialTestArm })
        posthog.setPersonProperties(undefined, { [TRIAL_CARD_PROPERTY]: trialTestArm })
    }, [trialTestArm, nextUserId])

    // The intent cookie says an account is about to be born: every sign-in path that can land on an
    // account already signed up leaves it out, or has it cleared (`/auth/callback` for Google). It is
    // emitted once `signed_up_at` reaches this row through realtime, the server stamping it the moment
    // an account stops being anonymous. The freshness window only guards against a forgotten cookie.
    const signedUpAt = user?.id === nextUserId ? user?.signed_up_at : null
    useEffect(() => {
        if (!sessionUser || sessionUser.isAnonymous || !signedUpAt) return
        if (getCookie('rr_signup_at')) return
        const method = getCookie(SIGNUP_INTENT_COOKIE) as SignupMethod | undefined
        if (!method) return
        if (Date.now() - Date.parse(signedUpAt) > FRESH_SIGNUP_MS) {
            deleteSharedCookie(SIGNUP_INTENT_COOKIE)
            return
        }
        track('account_created', { method, ...readAttribution() })
        // The only moment an affiliate can be credited: the referral cookie is still there, and
        // this effect is the one place that knows the account is new rather than merely signed in.
        reportAffiliateSignup({ email: sessionUser.email ?? undefined, externalUserId: sessionUser.id })
        setSharedCookie('rr_signup_at', String(Date.now()))
        deleteSharedCookie(SIGNUP_INTENT_COOKIE)
    }, [nextUserId, isAnonymous, signedUpAt])

    const accountId = sessionUser && !sessionUser.isAnonymous ? sessionUser.id : null
    const signupSettled = !accountId || !!signedUpAt

    // An anonymous visitor who just signed up keeps their id: the row in hand is theirs, read before
    // the server stamped it. The stamp normally comes back through realtime, or through the signup
    // form's own refresh; this keeps asking in case neither arrives, which a mobile webview whose
    // socket had just reconnected once managed, leaving the tab without a steward.
    useEffect(() => {
        if (!accountId || user?.id !== accountId || user.signed_up_at) return
        const controller = new AbortController()
        void awaitSignupStamp(() => readSignupStampAction(), controller.signal).then(stamp => {
            if (stamp) setUser(previous => (previous?.id === accountId ? { ...previous, signed_up_at: stamp } : previous))
        })
        return () => controller.abort()
    }, [accountId, user?.id, user?.signed_up_at])

    useRealtimeSubscription('users', {
        channelId: 'user-provider',
        filter: user?.id ? { column: 'id', value: user.id } : undefined,
        enabled: !!user?.id,
        onUpdate: updatedUser => {
            setUser(previous => ({ ...(updatedUser as User), workspace_id: previous?.workspace_id ?? updatedUser.workspace_id }))
            if (updatedUser.workspace_id !== storedWorkspaceIdRef.current) {
                storedWorkspaceIdRef.current = updatedUser.workspace_id
                void fetchWorkspaces()
            }
        },
        onResync: () => {
            if (accountId && !signedUpAt) void fetchUser()
        },
    })

    useRealtimeSubscription('workspaces', {
        channelId: 'workspace-provider',
        filter: user?.workspace_id ? { column: 'id', value: user.workspace_id } : undefined,
        enabled: !!user?.workspace_id,
        onUpdate: updatedWorkspace => {
            setWorkspace(updatedWorkspace as Workspace)
        },
    })

    useRealtimeSubscription('workspace_members', {
        channelId: 'workspace-members-provider',
        filter: user?.id ? { column: 'user_id', value: user.id } : undefined,
        enabled: !!user?.id,
        onInsert: () => fetchWorkspaces(),
        onUpdate: row => {
            if (row.workspace_id === workspaceId) setLoadedRole({ workspaceId: row.workspace_id, role: row.role, boxScope: toBoxScope(row.box_scope) })
        },
        onDelete: () => fetchWorkspaces(),
        onResync: () => setRoleReads(reads => reads + 1),
    })

    // Only the latest read lands: an older one still in flight, the one fired before the signup was
    // stamped or the one for an account since left, would otherwise write over a newer row.
    async function fetchUser() {
        const seq = ++userReadSeq.current
        const data = await readSessionUserAction().catch(() => null)
        const tabUser = data && { ...data, workspace_id: await resolveTabWorkspace(data) }
        if (seq !== userReadSeq.current) return
        storedWorkspaceIdRef.current = data?.workspace_id ?? null
        setUser(tabUser)
        setUserLoading(false)
    }

    // The tab's pin stands only while the account still belongs to it: one left behind by an
    // anonymous visit or a removal falls back on the stored workspace. Checked on the membership,
    // since every workspace row is readable. A workspace named in the URL comes first: it is the
    // landing of a flow that just moved the account (an accepted invitation, a creator's sandbox).
    async function resolveTabWorkspace(row: User): Promise<number> {
        const pinned = readUrlWorkspace() ?? readTabWorkspace()
        if (pinned === null || pinned === row.workspace_id) return row.workspace_id
        return (await isWorkspaceMemberAction(pinned).catch(() => false)) ? pinned : row.workspace_id
    }

    async function fetchWorkspace() {
        if (!user?.workspace_id) return
        const data = await readWorkspaceAction(user.workspace_id).catch(() => null)
        setWorkspace(data)
        setWorkspaceLoading(false)
    }

    async function fetchWorkspaces() {
        if (!user?.id) return
        const read = await readMemberWorkspacesAction().catch(() => null)
        if (!read) return
        // Removed from the workspace this tab is on: it reloads onto the one the server moved the
        // account to. Not when that is the stored one, which would reload into the same place.
        const tabWorkspaceId = user.workspace_id
        if (tabWorkspaceId && tabWorkspaceId !== storedWorkspaceIdRef.current && !read.ids.includes(tabWorkspaceId) && !isWorkspaceSwitchInFlight()) {
            enterActiveWorkspace()
            return
        }
        setWorkspaces(read.workspaces)
    }

    // The session's signed copy lags a few minutes behind the row: a claimed address or a new name
    // is read past it.
    async function refreshUser() {
        await authSession.refetch({ query: { disableCookieCache: true } })
        await fetchUser()
    }

    usePresenceHeartbeat(!!user?.id && !isAnonymous)

    const signOut = async () => {
        await authClient.signOut()
        router.push(routes.auth)
    }

    return (
        <SessionContext.Provider value={{ user, workspace, workspaceAnswers, role, boxScope, workspaces, session, isAnonymous, signupSettled, loading: userLoading || workspaceLoading, signOut, refreshWorkspace: fetchWorkspace, refreshUser }}>
            {children}
        </SessionContext.Provider>
    )
}

// For the render labs, which draw session-bound components with no signed-in user behind them.
export function SessionFixture({ value, children }: PropsWithChildren<{ value: SessionContextValue }>) {
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// For forms also drawn outside the dashboard (/unsubscribe, the render labs), where no provider exists.
export function useOptionalSession() {
    return useContext(SessionContext)
}

export function useSession() {
    const context = useContext(SessionContext)
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider')
    }
    return context
}

// An admin of the tab's workspace, as opposed to `useIsAdmin`, which is Lumvika staff. False while the
// role is still loading, so an admin-only control starts disabled rather than flashing open.
export function useIsWorkspaceAdmin(): boolean {
    return useSession().role === 'admin'
}
