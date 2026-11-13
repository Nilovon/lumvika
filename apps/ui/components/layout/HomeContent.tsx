'use client'

import { confirmTemplatePurchaseAction } from '@lumvika/cloud/marketplace.client'
import { AppLoader } from '@/components/layout/AppLoader'
import { AuthDialog } from '@/components/dialogs/AuthDialog'
import { BuilderView } from '@/components/builder/BuilderView'
import { useRewindEnabled } from '@/components/layout/FeatureFlagsProvider'
import { PostPaymentDialog, TemplatePurchaseSuccessDialog } from '@lumvika/cloud/billing.client'
import { AgentShareDeepLinkDialog } from '@/components/dialogs/AgentShareDeepLinkDialog'
import { TemplateDeepLinkDialog } from '@/components/dialogs/TemplateDeepLinkDialog'
import { WorkspacePausedBanner } from '@/components/layout/WorkspacePausedBanner'
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher'
import { useRewindLauncher, useRewindStore } from '@lumvika/cloud/rewind.client'
import { useChangelogLauncher } from '@/components/changelog/useChangelogLauncher'
import { useAccountStore } from '@/stores/account.store'
import { useBillingStore } from '@/stores/billing.store'
import { useBoardStore } from '@/stores/board.store'
import { useCreatorStore } from '@/stores/creator.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { hasPendingStart, useOnboardingStore } from '@/stores/onboarding.store'
import { useAgentShareStore } from '@/stores/agent-share.store'
import { useTemplateFlowStore } from '@/stores/template-flow.store'
import { useStewardStore } from '@/stores/steward.store'
import { useEntryWalls } from '@/hooks/useEntryWalls'
import { useResumePendingStart } from '@/lib/onboarding/useResumePendingStart'
import { openConversationFromNotification } from '@/lib/notifications/open-conversation'
import { findNotificationLinkAction } from '@/app/api/_actions/notification-reads.actions'
import { AGENT_FOCUS_TABS, type AgentFocusTab, type SpacePublic } from '@/lib/board/types'
import { useSearchParams } from 'next/navigation'
import { WORKSPACE_PARAM } from '@/lib/workspace/workspace-header'
import { useEffect, useRef, useState } from 'react'
import { ACCOUNT_LINK_ERROR_PARAM, ACCOUNT_LINK_PROVIDER_PARAM, ACCOUNT_PARAM, linkErrorMessage } from '@/lib/auth/link-intent'
import { OAUTH_PROVIDER_CONFIG, isOAuthProvider, type OAuthProvider } from '@/lib/auth/oauth-providers'
import { oauthErrorCode, oauthRetryCopy, withoutOAuthError } from '@/lib/auth/oauth-error'
import { oauthProviderLeftFor } from '@/lib/auth/oauth-sign-in'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { track } from '@lumvika/analytics/client'

// `history.replaceState` plutôt que `router.replace` : Next le synchronise avec `useSearchParams`
// sans repasser par le serveur, donc pas de re-render de la page dynamique (fallback du Suspense
// qui reflashe) ni de navigation qu'une réponse de server action peut recouvrir.
function clearSearchParams(...keys: string[]) {
    const url = new URL(window.location.href)
    if (!keys.some(key => url.searchParams.has(key))) return
    for (const key of keys) url.searchParams.delete(key)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function clearTemplateParam() {
    clearSearchParams('template')
}

export function HomeContent({ initialSpaces = [], initialWorkspaceId = null }: { initialSpaces?: SpacePublic[]; initialWorkspaceId?: number | null }) {
    const t = useTranslations('layout')
    const tOAuthRetry = useTranslations('auth.oauthRetry')
    const tLinkError = useTranslations('account.signIn.linkError')
    const { user, workspace, loading, isAnonymous, signupSettled } = useSession()
    const stewardFunnel = useStewardStore(state => state.funnel)
    const stewardIntake = useStewardStore(state => state.intake)
    const stewardOpen = useStewardStore(state => state.open)
    const stewardWaitlisted = useStewardStore(state => state.waitlisted)
    const pendingIntake = useOnboardingStore(state => state.pendingIntake)
    const rewindEnabled = useRewindEnabled()
    const resumePendingStart = useResumePendingStart()
    const searchParams = useSearchParams()
    const [postPaymentOpen, setPostPaymentOpen] = useState(false)
    // Le mur ne se referme que sur un succès : la dialog bloquante n'appelle onOpenChange que là.
    // On ne peut pas se contenter de `isAnonymous`, car un signup en attente de confirmation d'email
    // laisse la session anonyme en place, et l'utilisateur resterait enfermé derrière son propre mur.
    const [accountClaimed, setAccountClaimed] = useState(false)
    const [signInRetry, setSignInRetry] = useState<{ code: string; provider: OAuthProvider | null } | null>(null)
    // Un anonyme n'est laissé devant le board que le temps de la carte d'accueil : elle ne coûte
    // aucun modèle et c'est elle qui dessine sa boîte. Une fois répondue, c'est le bouton au pied de
    // la colonne qui ouvre la dialog de compte, jamais elle qui surgit seule, même colonne refermée :
    // l'orbe la rouvre sur ce bouton. Le reste (colonne refermée pendant la carte, phase qui n'est
    // pas un tunnel) le ramène au mur.
    const stewardHoldsTheWall = stewardFunnel === 'unknown' || (stewardFunnel === 'guided' && (stewardIntake ? stewardOpen !== false : pendingIntake !== null))
    // The waitlist wall is the layout's (DashboardRuntime): it stands on every page.
    const { arrivalHoldsTheWall } = useEntryWalls()
    const accountWallOpen = isAnonymous && !accountClaimed && !stewardHoldsTheWall && !arrivalHoldsTheWall
    const retryCopy = signInRetry ? oauthRetryCopy(signInRetry.code, signInRetry.provider ? OAUTH_PROVIDER_CONFIG[signInRetry.provider].label : null, tOAuthRetry) : null
    const templateLinkSlug = useTemplateFlowStore(s => s.linkSlug)
    const shareLinkToken = useAgentShareStore(s => s.token)
    const purchase = useTemplateFlowStore(s => s.purchase)
    const hydrated = useBoardStore(s => s.hydrated)
    const selectedAgentWorking = useBoardStore(s =>
        s.selectedAgentId !== null &&
        s.agents.some(a => a.id === s.selectedAgentId && a.status === 'working')
    )

    // Retour de Stripe : si on revient avec ?billing=success et qu'un brouillon d'agent attend
    // (onboarding), on propose de démarrer l'agent. On nettoie le param pour ne pas re-déclencher.
    useEffect(() => {
        if (searchParams.get('billing') !== 'success') return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (hasPendingStart(useOnboardingStore.getState())) setPostPaymentOpen(true)
        clearSearchParams('billing')
    }, [searchParams])

    // The workspace a landing named is pinned by the session once it loads: the URL has done its job.
    useEffect(() => {
        if (loading) return
        clearSearchParams(WORKSPACE_PARAM)
    }, [loading])

    // Every end-of-access email links here: open billing straight away, once the account is known.
    useEffect(() => {
        if (searchParams.get('billing') !== '1' || loading || isAnonymous) return
        useBillingStore.getState().openBilling(undefined, 'email_link')
        clearSearchParams('billing')
    }, [searchParams, loading, isAnonymous])

    // Connecting a provider from the account settings leaves the app and comes back here: the
    // settings reopen where they were left, with the reason when the connection was refused.
    useEffect(() => {
        if (searchParams.get(ACCOUNT_PARAM) !== 'sign-in' || loading || isAnonymous) return
        const linkError = searchParams.get(ACCOUNT_LINK_ERROR_PARAM)
        const linkProvider = searchParams.get(ACCOUNT_LINK_PROVIDER_PARAM)
        useAccountStore.getState().openAccount('sign-in')
        if (linkError) toast.error(linkErrorMessage(linkError, isOAuthProvider(linkProvider) ? linkProvider : 'google', tLinkError))
        clearSearchParams(ACCOUNT_PARAM, ACCOUNT_LINK_ERROR_PARAM, ACCOUNT_LINK_PROVIDER_PARAM)
    }, [searchParams, loading, isAnonymous, tLinkError])

    // A provider sign-in that failed upstream lands here with the error in the URL, where it would
    // otherwise stay for the whole session. Only someone still anonymous needs to hear about it: an
    // account already signed in got there through another tab. A toast would leave them on a screen
    // with no provider button, so the account dialog reopens and says what happened.
    useEffect(() => {
        if (loading) return
        const url = new URL(window.location.href)
        const code = oauthErrorCode(url)
        if (!code) return
        if (isAnonymous) {
            const provider = oauthProviderLeftFor()
            track('oauth_sign_in_failed', { code, provider })
            // The URL is the only place the failure lives, and this effect is what wipes it.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSignInRetry({ code, provider })
        }
        const clean = withoutOAuthError(url)
        window.history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`)
    }, [searchParams, loading, isAnonymous])

    // Retour de l'onboarding Stripe Connect d'un créateur : Stripe redirige sur la home, donc c'est
    // ici qu'on rouvre le panel créateur sur son pane payouts. `connect=refresh` signale un lien
    // expiré, que le pane consomme pour en remint un tout de suite.
    useEffect(() => {
        if (searchParams.get('creator') !== 'payouts') return
        const store = useCreatorStore.getState()
        store.openCreator({ kind: 'payouts' })
        if (searchParams.get('connect') === 'refresh') store.setConnectRefresh(true)
        clearSearchParams('creator', 'connect')
    }, [searchParams])

    // Trial abandonné depuis la fiche d'une template : rien n'a été engagé, et la template parkée
    // n'a plus rien pour revenir à l'écran. On rouvre la fiche là où l'utilisateur l'a laissée et on
    // dépark, sinon l'entrée traîne et fait passer le board pour occupé.
    useEffect(() => {
        if (searchParams.get('billing') !== 'cancel') return
        const parked = useOnboardingStore.getState().pendingTemplate
        if (parked?.needsPlacement) {
            useOnboardingStore.getState().clearPendingTemplate()
            useTemplateFlowStore.getState().openLink(parked.slug)
        }
        clearSearchParams('billing')
    }, [searchParams])

    // Retour du checkout d'une template payante. Le slug reste dans l'URL pour que la dialog sache
    // ce qui vient d'être acheté, et `session_id` ouvre la voie rapide : confirmer la session sans
    // attendre le webhook. Une annulation ramène à la fiche, là où l'utilisateur l'avait laissée,
    // plutôt qu'à un board nu avec un toast.
    const purchaseStarted = useRef(false)
    useEffect(() => {
        const outcome = searchParams.get('purchase')
        if (!outcome || purchaseStarted.current) return
        purchaseStarted.current = true

        const slug = searchParams.get('template')
        const sessionId = searchParams.get('session_id')
        const flow = useTemplateFlowStore.getState()
        // Achetée en plein tunnel d'arrivée : c'est la carte d'achat de la colonne qui attend ce
        // retour et lance l'install, la fiche et le placement à la main n'ont rien à y faire.
        if (useOnboardingStore.getState().pendingTemplateLink === slug) {
            if (outcome === 'cancel') toast(t('purchaseCancelled'))
            else if (sessionId) void confirmTemplatePurchaseAction(sessionId)
            clearSearchParams('purchase', 'template', 'session_id')
            return
        }
        if (outcome === 'cancel') {
            toast(t('purchaseCancelled'))
            if (slug) flow.openLink(slug)
        } else if (slug) {
            flow.openPurchase({ slug, sessionId })
        }
        clearSearchParams('purchase', 'template', 'session_id')
    }, [searchParams, t])

    // Lien de partage de template `?template=<slug>` : il court-circuite tout le wizard de
    // recrutement pour poser sa fiche, seule à l'écran. Le slug part dans le store AVANT que le
    // param soit nettoyé : c'est lui qui dit au board qu'un parcours d'installation tient l'écran,
    // et la moindre fenêtre entre les deux suffit à la library pour s'ouvrir par-dessus. La fiche
    // charge la template elle-même. Le ref garde l'effet contre le remontage.
    //
    // Le retour de checkout porte lui aussi `?template=`, d'où la garde sur `purchase` : sans elle
    // les deux dialogs s'empileraient.
    //
    // Tant que le visiteur n'a pas de compte, le mur d'auth est seul à l'écran : on garde le slug de
    // côté (persisté, car le retour de Google perd la query string) et l'effet rejoue tout seul dès
    // que la session est réelle.
    //
    // Un workspace jamais onboardé n'a pas encore vu la moindre explication du produit : le slug reste
    // parké et c'est le Steward qui le reprend dans son tunnel. L'onboarding est un fait du workspace,
    // pas de l'user : un membre invité dans un workspace qui tourne voit la fiche tout de suite.
    //
    // Avec le Steward, c'est lui qui décide : tant que la phase n'est pas revenue (`unknown`) la
    // fiche attend, et elle ne s'ouvre jamais d'elle-même pendant le tunnel. Sans cette attente,
    // l'effet rejouerait à la seconde où save_profile stampe l'onboarding et poserait la fiche
    // par-dessus une conversation en cours.
    const templateLinkStarted = useRef(false)
    useEffect(() => {
        const slug = searchParams.get('template') ?? useOnboardingStore.getState().pendingTemplateLink
        if (!slug || searchParams.has('purchase') || templateLinkStarted.current || !workspace || !user) return
        // Le mur de waitlist passe le funnel en `companion`, et la fiche s'ouvrirait par-dessus avec
        // son bouton de trial : elle reste parkée jusqu'au chargement où une machine est libre.
        if (isAnonymous || stewardWaitlisted || (!workspace.onboarded_at && !workspace.is_sandbox)) {
            useOnboardingStore.getState().setPendingTemplateLink(slug)
            clearTemplateParam()
            return
        }
        if (stewardFunnel !== 'companion') return
        templateLinkStarted.current = true
        useOnboardingStore.getState().clearPendingTemplateLink()
        useTemplateFlowStore.getState().openLink(slug)
        clearTemplateParam()
    }, [searchParams, user, workspace, isAnonymous, stewardFunnel, stewardWaitlisted])

    // Lien de partage d'agent `?share=<token>` : le jumeau de `?template=`. Le token est parké dans
    // tous les cas (persisté, car le retour de Google perd la query string) et l'effet rejoue dès que
    // la session est réelle.
    const shareLinkStarted = useRef(false)
    useEffect(() => {
        const token = searchParams.get('share') ?? useOnboardingStore.getState().pendingShareLink
        if (!token || shareLinkStarted.current || !workspace || !user) return
        // Ouverte derrière le mur d'auth, la fiche serait restée par-dessus le mur de waitlist avec son
        // bouton de trial : on la referme, le token reste parké pour le chargement suivant.
        if (stewardWaitlisted && !isAnonymous) {
            useAgentShareStore.getState().closeLink()
            useOnboardingStore.getState().setPendingShareLink(token)
            clearSearchParams('share')
            return
        }
        // Un workspace jamais onboardé passe par le tunnel d'arrivée : c'est la colonne qui présente
        // le coworker partagé et l'installe, la fiche ferait doublon par-dessus.
        if (isAnonymous || (!workspace.onboarded_at && !workspace.is_sandbox)) {
            useOnboardingStore.getState().setPendingShareLink(token)
            clearSearchParams('share')
            return
        }
        useAgentShareStore.getState().openLink(token)
        shareLinkStarted.current = true
        useOnboardingStore.getState().clearPendingShareLink()
        clearSearchParams('share')
    }, [searchParams, user, workspace, isAnonymous, stewardWaitlisted])

    // Un email de cycle de vie pointe l'agent dont il parle. Le board doit être hydraté avant, sinon
    // la sélection porte sur un id que le store ne connaît pas encore et rien ne s'ouvre.
    const agentLinkOpened = useRef(false)
    useEffect(() => {
        const agentId = searchParams.get('agent')
        if (!agentId || agentLinkOpened.current || !hydrated || isAnonymous) return
        agentLinkOpened.current = true
        const tab = searchParams.get('tab')
        useBoardStore.getState().openAgentTab(agentId, AGENT_FOCUS_TABS.includes(tab as AgentFocusTab) ? (tab as AgentFocusTab) : 'chat')
        clearSearchParams('agent', 'tab')
    }, [searchParams, hydrated, isAnonymous])

    // A notification email opens the conversation it is about, the same way its toast does. A row
    // the user can no longer read (another workspace, deleted since) leaves the board as it is.
    const notificationLinkOpened = useRef(false)
    useEffect(() => {
        const notificationId = searchParams.get('notification')
        if (!notificationId || notificationLinkOpened.current || !hydrated || isAnonymous) return
        notificationLinkOpened.current = true
        clearSearchParams('notification')
        void findNotificationLinkAction(notificationId)
            .catch(() => null)
            .then(link => {
                if (link) void openConversationFromNotification(link)
            })
    }, [searchParams, hydrated, isAnonymous])

    // Le lien est consommé : le param ne doit plus rien porter, sinon un refresh (après un import
    // réussi comme après une annulation) redemande l'import. Un seul nettoyage ne suffit pas, le
    // commit router d'un server action peut atterrir après lui et remettre l'URL de départ, donc on
    // renettoie chaque fois que le param réapparaît.
    useEffect(() => {
        if (!templateLinkStarted.current || !searchParams.get('template')) return
        clearTemplateParam()
    }, [searchParams])

    // Reprise après conversion d'un compte anonyme : la session réelle est en place (nouvel email,
    // compte existant, ou Google). Si un brouillon attend et que le flag one-shot est présent, on
    // termine la création du premier agent sur le workspace désormais résolu.
    //
    // Pas tant que le tampon du signup n'a pas atteint l'onglet : le flag attend, persisté, et la
    // reprise repart dès que le compte est réglé.
    useEffect(() => {
        if (loading || !workspace || !signupSettled) return
        if (!hasPendingStart(useOnboardingStore.getState())) return
        // Un brouillon posé par le composer de la landing chez quelqu'un qui n'a jamais vu Lumvika
        // n'attend pas le paywall : c'est le Steward qui ouvre la conversation dessus, et qui le
        // consomme. Le flag one-shot est consommé quand même, sinon il ressortirait plus tard,
        // par-dessus la conversation.
        const stewardTakesOver = useOnboardingStore.getState().firstAgentFromPrompt && !workspace.onboarded_at
        if (!useOnboardingStore.getState().consumeResume()) return
        if (stewardTakesOver) return
        void resumePendingStart()
    }, [loading, workspace, signupSettled, resumePendingStart])

    // Kickoff parqué mais jamais envoyé (reload ou crash pendant le wizard "Finish setup", ou
    // envoi précédent en échec) : on le rejoue au boot et on ouvre le panel de l'agent sur la
    // conversation démarrée. Sans entrée en localStorage, sendPendingKickoff ne fait rien.
    useEffect(() => {
        if (loading || !workspace || !hydrated) return
        void useBoardStore
            .getState()
            .sendPendingKickoff()
            .then(sent => {
                if (sent) useBoardStore.getState().selectAgent(sent.agentId)
            })
    }, [loading, workspace, hydrated])

    useEffect(() => {
        if (!selectedAgentWorking) return
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [selectedAgentWorking])

    // Le Rewind hebdo s'ouvre tout seul une fois, mais jamais par-dessus un parcours qui tient déjà
    // l'écran (mur d'auth, onboarding, deep link de template ou de partage).
    const rewindDeepLinked = searchParams.has('rewind')
    // Le flag entre dans `ready` plutôt qu'autour du hook, qu'on ne peut pas appeler
    // conditionnellement : `ready` à faux suffit à ne jamais lire les semaines ni ouvrir la story.
    const rewindReady = rewindEnabled && hydrated && !isAnonymous && Boolean(workspace?.onboarded_at) && !templateLinkSlug && !shareLinkToken && !purchase
    useRewindLauncher(workspace?.id, rewindReady, rewindDeepLinked)
    useEffect(() => {
        // Nettoyé aussi quand la feature est masquée, sinon `?rewind` colle à l'URL sans rien faire.
        if (rewindDeepLinked && (rewindReady || !rewindEnabled)) clearSearchParams('rewind')
    }, [rewindReady, rewindDeepLinked, rewindEnabled])

    // Le changelog arrive derrière la même porte que le Rewind, plus deux conditions à lui : une
    // session restée anonyme passerait par `accountWallOpen` seul, qui retombe dès que le mur est
    // écarté ; et deux overlays qui s'ouvrent seuls au même chargement se recouvriraient.
    const rewindShown = useRewindStore(state => state.shown !== null)
    const changelogReady = hydrated && !accountWallOpen && !isAnonymous && Boolean(workspace?.onboarded_at) && !templateLinkSlug && !shareLinkToken && !purchase && !rewindShown
    useChangelogLauncher(user?.id, changelogReady)

    // The page load names no workspace, so the server prefetched the stored one. A tab pinned
    // elsewhere shows neither those spaces nor an empty board in their place (the recruit
    // placeholder): it keeps the loader until the store holds its own.
    const serverBoardMatchesTab = initialWorkspaceId === workspace?.id

    if (loading || (!serverBoardMatchesTab && !hydrated)) {
        return <AppLoader />
    }

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            <main className="flex-1 relative overflow-hidden">
                <BuilderView initialSpaces={serverBoardMatchesTab ? initialSpaces : []} />
                <WorkspaceSwitcher />
                <WorkspacePausedBanner />
            </main>
            {/* Le mur d'entrée : le board reste visible derrière, mais rien n'est actionnable tant
                qu'il n'y a pas de compte. Le signup upgrade la session anonyme en place, donc le
                workspace déjà provisionné et tout ce qu'un deep link a parké lui restent attachés. */}
            <AuthDialog variant="welcome" open={accountWallOpen} onOpenChange={() => setAccountClaimed(true)} copy={retryCopy} />
            {!accountWallOpen && <AuthDialog variant="signin" open={signInRetry !== null && isAnonymous} onOpenChange={open => !open && setSignInRetry(null)} copy={retryCopy} />}
            <PostPaymentDialog open={postPaymentOpen} onOpenChange={setPostPaymentOpen} />
            {purchase && <TemplatePurchaseSuccessDialog slug={purchase.slug} sessionId={purchase.sessionId} onOpenChange={open => !open && useTemplateFlowStore.getState().closePurchase()} />}
            {templateLinkSlug && <TemplateDeepLinkDialog slug={templateLinkSlug} />}
            {shareLinkToken && <AgentShareDeepLinkDialog token={shareLinkToken} />}
        </div>
    )
}
