import type { Me } from '@lumvika/contracts'
import * as SecureStore from 'expo-secure-store'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { fetchMe } from '@/api/account'
import { isAdminRole } from '@/auth/access'
import { ApiError } from '@/api/client'
import { authClient } from '@/auth/auth-client'
import { bootstrap } from '@/auth/sign-in'
import { cachedMe, clearLocalCache } from '@/data/local-cache'
import { forgetPerson, identifyPerson, registerWorkspace } from '@/lib/analytics'
import { registerDevice, unregisterDevice } from '@/notifications/push'

// Each device keeps its own active workspace, as the hub expects: it is named on every request
// instead of moving the account's default under the web session.
const WORKSPACE_KEY = 'lumvika.workspace-id'

// Long enough for the hub to forget this phone's push token, short enough that leaving never hangs.
const UNREGISTER_TIMEOUT_MS = 3000

// `access_token` is the Better Auth session token, sent to the hub as `Authorization: Bearer`.
export type Session = {
    access_token: string
    user: { id: string; email: string | null }
}

type AuthState = {
    // False until the stored session has been read: the app shows nothing rather than flash sign-in.
    ready: boolean
    session: Session | null
    me: Me | null
    switchWorkspace: (workspaceId: number) => Promise<void>
    // Reads the account again, for what changes under it: a workspace that just started its plan.
    refreshMe: () => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function storedWorkspaceId(): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(WORKSPACE_KEY)
    return raw && /^\d+$/.test(raw) ? Number(raw) : null
}

// The account's default workspace comes back from bootstrap. The one this device last picked wins over
// it, unless the account has since left it.
async function loadMe(accessToken: string): Promise<Me> {
    const provisioned = await bootstrap(accessToken)
    const picked = await storedWorkspaceId()
    if (picked === null || picked === provisioned.workspace.id) return provisioned
    try {
        return await fetchMe({ accessToken, workspaceId: picked })
    } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) throw error
        await SecureStore.deleteItemAsync(WORKSPACE_KEY)
        return provisioned
    }
}

const withinTimeout = (work: Promise<unknown>, ms: number) => Promise.race([work.catch(() => {}), new Promise(resolve => setTimeout(resolve, ms))])

export function AuthProvider({ children }: { children: ReactNode }) {
    // The hub is asked for the session on launch; offline, the stored one holds until the hub refuses it.
    const { data, isPending } = authClient.useSession()
    const [signingOut, setSigningOut] = useState(false)
    // The account, stamped with the person it was read for.
    const [account, setAccount] = useState<{ userId: string; me: Me | null } | null>(null)

    const token = signingOut ? null : (data?.session.token ?? null)
    const userId = signingOut ? null : (data?.user.id ?? null)
    const email = signingOut ? null : (data?.user.email ?? null)
    const session = useMemo<Session | null>(() => (token && userId ? { access_token: token, user: { id: userId, email } } : null), [token, userId, email])
    const me = userId && account && account.userId === userId ? account.me : null
    // The session kept in the Keychain counts at once: the hub confirms it behind, offline included.
    const ready = (!isPending || data !== null) && (!userId || account?.userId === userId)

    useEffect(() => {
        if (!data) setSigningOut(false)
    }, [data])

    // A session the hub ended elsewhere leaves nothing of the account behind on the phone.
    const previousUserId = useRef<string | null>(null)
    useEffect(() => {
        if (previousUserId.current && previousUserId.current !== userId) clearLocalCache()
        previousUserId.current = userId
    }, [userId])

    useEffect(() => {
        if (email) identifyPerson(email)
    }, [email])

    const workspaceId = me?.workspace.id
    useEffect(() => {
        if (workspaceId) registerWorkspace(workspaceId)
    }, [workspaceId])

    // Keyed on the user, not the session: a refreshed session is the same person.
    useEffect(() => {
        if (!userId || !token) {
            setAccount(null)
            return
        }
        let cancelled = false
        // The account as last read: the home opens on it while the hub is asked again.
        setAccount({ userId, me: cachedMe(userId).read() })
        cachedMe(userId)
            .load(() => loadMe(token))
            .then(result => {
                if (!cancelled && result) setAccount({ userId, me: result })
            })
            .catch(error => console.warn('[auth] loading the account failed', error))
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

    useEffect(() => {
        if (!token || !workspaceId) return
        registerDevice({ accessToken: token, workspaceId }).catch(error => console.warn('[push] registering the device failed', error))
        // Once per signed-in person, not per refreshed session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, workspaceId])

    const switchWorkspace = useCallback(
        async (workspaceId: number) => {
            if (!session) return
            const next = await cachedMe(session.user.id).load(() => fetchMe({ accessToken: session.access_token, workspaceId }))
            setAccount({ userId: session.user.id, me: next })
            await SecureStore.setItemAsync(WORKSPACE_KEY, String(workspaceId))
        },
        [session]
    )

    const refreshMe = useCallback(async () => {
        if (!session || !me) return
        const next = await cachedMe(session.user.id).load(() => fetchMe({ accessToken: session.access_token, workspaceId: me.workspace.id }))
        setAccount({ userId: session.user.id, me: next })
    }, [session, me])

    // The screen leaves first: no hub call may hold the person on a home they asked to leave. The
    // device is unregistered before the session is revoked, since the hub refuses its token after;
    // the other devices of the person stay signed in.
    const signOut = useCallback(async () => {
        const caller = session && me ? { accessToken: session.access_token, workspaceId: me.workspace.id } : null
        setSigningOut(true)
        setAccount(null)
        clearLocalCache()
        await SecureStore.deleteItemAsync(WORKSPACE_KEY).catch(() => {})
        if (caller) await withinTimeout(unregisterDevice(caller), UNREGISTER_TIMEOUT_MS)
        const { error } = await authClient.signOut().catch((failure: unknown) => ({ error: failure }))
        if (error) console.warn('[auth] signing out failed', error)
        forgetPerson().catch(() => {})
    }, [session, me])

    return <AuthContext.Provider value={{ ready, session, me, switchWorkspace, refreshMe, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
    const value = useContext(AuthContext)
    if (!value) throw new Error('useAuth must be used inside AuthProvider')
    return value
}

// Read off the active workspace's account, so switching workspace switches the role with it.
export function useIsWorkspaceAdmin(): boolean {
    return isAdminRole(useAuth().me?.workspace.role)
}
