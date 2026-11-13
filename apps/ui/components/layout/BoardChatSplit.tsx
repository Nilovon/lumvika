'use client'

import { useReducedMotion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { type CSSProperties, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useResolvedIsMobile } from '@lumvika/ui/primitives/use-is-mobile'

import { StewardColumn } from '@/components/steward/StewardColumn'
import { StewardDropPreview } from '@/components/steward/StewardDropPreview'
import { ProviderStatusBanner } from '@/components/layout/ProviderStatusBanner'
import {
    DEFAULT_STEWARD_PLACEMENT,
    SHELL_SIDEBAR_EXPANDED_WIDTH,
    SHELL_SIDEBAR_RAIL_WIDTH,
    type StewardCorner,
    type StewardPlacement,
    dockedStewardSide,
    loadStewardOrbCorner,
    loadStewardPlacement,
    stewardDockSqueezeQuery,
} from '@/lib/steward-layout'
import { loadStewardOpen } from '@/lib/steward-open'
import { cn } from '@/lib/utils'
import { useBoardStore } from '@/stores/board.store'
import { selectStewardVisible, useStewardStore } from '@/stores/steward.store'

/**
 * Le cadre du dashboard : la carte du board et, docké à sa droite ou à sa gauche, le chat de l'orbe.
 * Docké, ouvrir le chat rétracte la carte au lieu de la recouvrir, et le chat se pose sur le frame,
 * hors de la carte — c'est ce qui distingue le Steward de tout ce qui vit sur le board. Flottant, il
 * quitte la grille et se pose dans un coin, par-dessus la carte qui reprend toute la largeur.
 *
 * `initialOpen` est ce que le cookie disait : le serveur rend déjà la bonne colonne, sinon elle
 * s'ouvrirait en glissant à chaque chargement. `null` = aucune préférence connue, et là c'est le
 * défaut de l'écran qui parle — ouvert à partir de `md`, fermé en dessous, deux choses que les
 * classes de breakpoint savent servir en même temps sans rien mesurer.
 *
 * Un workspace sorti de l'onboarding sans machine n'a pas de Steward : la colonne reste montée, c'est
 * elle qui relit la phase, mais elle ne prend ni piste ni place à l'écran.
 */
type BoardChatSplitProps = {
    initialOpen: boolean | null
    initialPlacement: StewardPlacement | null
    // The platform's navigation, on the frame left of the card from `md` up. Absent, the frame is
    // what it always was.
    sidebar?: { node: ReactNode; collapsed: boolean }
    children: ReactNode
}

export function BoardChatSplit({ initialOpen, initialPlacement, sidebar, children }: BoardChatSplitProps) {
    const visible = useStewardStore(selectStewardVisible)
    const requested = useStewardStore(state => state.open)
    const overlayOpen = useStewardStore(state => state.overlayOpen)
    const preferredPlacement = useStewardStore(state => state.placement) ?? initialPlacement ?? DEFAULT_STEWARD_PLACEMENT
    const pathname = usePathname()

    // Every page but the board docks the column only where its card keeps a comfortable width.
    // Elsewhere the column floats over the page from the orb's corner, and only while it is asked to.
    const sidebarWidth = sidebar ? (sidebar.collapsed ? SHELL_SIDEBAR_RAIL_WIDTH : SHELL_SIDEBAR_EXPANDED_WIDTH) : 0
    const tooNarrowToDock = useResolvedIsMobile(stewardDockSqueezeQuery({ dockWidth: preferredPlacement.dockWidth, sidebarWidth }))
    const squeezed = pathname !== '/' && preferredPlacement.mode === 'dock' && tooNarrowToDock === true
    useEffect(() => {
        useStewardStore.getState().setSqueezed(squeezed)
    }, [squeezed])
    useEffect(() => {
        useStewardStore.getState().closeOverlay()
    }, [pathname])
    // Read as the column opens, from the orb it unfolds from: the orb may have been dragged meanwhile.
    const [overlayCorner, setOverlayCorner] = useState<StewardCorner>('bottom-right')
    const [overlayCornerReadFor, setOverlayCornerReadFor] = useState(overlayOpen)
    if (overlayOpen !== overlayCornerReadFor) {
        setOverlayCornerReadFor(overlayOpen)
        if (overlayOpen) setOverlayCorner(loadStewardOrbCorner())
    }
    const placement = useMemo<StewardPlacement>(() => (squeezed ? { ...preferredPlacement, mode: 'float', corner: overlayCorner } : preferredPlacement), [squeezed, overlayCorner, preferredPlacement])

    const resolved = squeezed ? overlayOpen : (requested ?? initialOpen)
    const open = visible ? resolved : false
    const dragging = useStewardStore(state => state.dropTarget !== null)
    const docked = dockedStewardSide({ open, placement, dragging })
    const reduceMotion = useReducedMotion()
    const accountSwitches = useStewardStore(state => state.accountSwitches)
    const onboarded = useStewardStore(state => state.funnel === 'companion')

    // Le HTML du serveur est déjà peint quand l'hydratation démarre : rien ici ne peut arriver avant
    // le premier paint, c'est tout l'intérêt du cookie. Cet effet ne fait que trancher le `null` —
    // et refermer la colonne sur un téléphone, où elle est une sheet posée sur le board.
    useEffect(() => {
        useStewardStore.getState().restoreOpen(loadStewardOpen())
        useStewardStore.getState().restorePlacement(loadStewardPlacement())
    }, [])

    // Une sheet d'agent ouverte, d'où qu'elle vienne, efface la colonne le temps qu'elle reste là.
    // Sélectionner une Box n'ouvre plus de sheet : elle ne compte pas. Jamais pendant le tunnel : la colonne y mène, et la fermer devant la carte d'accueil
    // ferait surgir le mur de compte d'un anonyme (HomeContent).
    useEffect(() => {
        if (!visible) return
        return useBoardStore.subscribe((board, prev) => {
            const sheetOpen = board.selectedAgentId !== null
            const sheetWasOpen = prev.selectedAgentId !== null
            if (sheetOpen === sheetWasOpen) return
            const steward = useStewardStore.getState()
            if (!sheetOpen) steward.reclaimFromSheet()
            else if (steward.open === true && steward.funnel === 'companion') steward.yieldToSheet()
        })
    }, [visible])

    const grid = (
        <div
            data-steward-grid
            className={cn(
                'grid flex-1 min-h-0 min-w-0 w-full grid-cols-1 grid-rows-[minmax(0,1fr)] duration-300 ease-in-out',
                // Lu depuis le hook plutôt qu'écrit `motion-reduce:md:transition-none`, dont les deux
                // variants ne se départagent que par l'ordre source.
                visible && (reduceMotion ? 'md:transition-none' : 'md:transition-[grid-template-columns]'),
                // Des pistes, jamais une custom property : sans `@property` une variable CSS n'est
                // pas interpolée et la colonne sauterait au lieu de s'ouvrir. Toujours trois, une de
                // chaque côté du board, pour que passer d'un dock à l'autre reste une interpolation.
                // Steward éteint, il n'y en a qu'une : le `grid-cols-1` de base tient le board seul.
                visible &&
                    (docked === 'left'
                        ? 'md:grid-cols-[var(--steward-dock-track)_minmax(0,1fr)_0px]'
                        : docked === 'right'
                          ? 'md:grid-cols-[0px_minmax(0,1fr)_var(--steward-dock-track)]'
                          : 'md:grid-cols-[0px_minmax(0,1fr)_0px]')
            )}
        >
            <div className={cn('min-w-0 bg-background md:rounded-3xl md:border md:border-border md:shadow overflow-hidden md:overflow-auto h-full', visible && 'md:col-start-2 md:row-start-1')}>{children}</div>
            {/* Se connecter à un autre compte sans recharger repart d'une colonne neuve, qui relit
                la phase et la conversation de ce compte-là. */}
            <div className={visible ? 'contents' : 'hidden'}>
                <StewardColumn key={accountSwitches} open={open} placement={placement} preferredPlacement={preferredPlacement} overPage={squeezed} />
            </div>
        </div>
    )

    return (
        // --board-inset : ce dont la carte est rentrée du bord de l'écran, son padding plus son bord.
        // Les couches `fixed` posées par-dessus (l'orbe) le rajoutent pour tomber au même écart du
        // bord visible que le mobilier qui, lui, est `absolute` dans la carte.
        // `relative` porte la sheet de la colonne sous `md`. Elle est `absolute` et non `fixed`
        // justement pour que l'`overflow-clip` ci-dessous la découpe : repliée, elle est translatée
        // sous le bas de l'écran, et un `fixed` échapperait au découpage en ajoutant sa hauteur de
        // défilement au document.
        // --steward-dock-track : la largeur tirée de la piste docké, bornée pour laisser sa part au
        // board quand l'écran rétrécit. La poignée du dock réécrit --steward-dock-w ici pendant le geste.
        // --board-inset-start : le bord gauche de la carte quand la sidebar la pousse, pour les couches
        // `fixed` ancrées à gauche (l'orbe, la fenêtre flottante). Sans sidebar elles retombent sur --board-inset.
        <div
            data-steward-split
            style={{ '--steward-dock-w': `${placement.dockWidth}px` } as CSSProperties}
            className={cn(
                // `clip` and not `hidden`: the frame never scrolls, not even when focus or a scrollIntoView
                // reaches for something below it, which `hidden` allows and nothing could undo.
                'relative h-dvh w-full overflow-clip p-0 md:p-2 bg-frame flex flex-col [--board-inset:0px] md:[--board-inset:9px] [--steward-dock-track:min(var(--steward-dock-w),60vw)]',
                // The sidebar's width plus its gap to the card, as AppSidebar draws it: a rail below `lg`.
                // With the sidebar the workspace pill leaves the card's top-left corner, and the orb parked there moves up into its row.
                sidebar && 'md:[--shell-sidebar-w:52px] md:[--board-inset-start:calc(9px+var(--shell-sidebar-w))] md:[--steward-orb-top-row:1]',
                sidebar && !sidebar.collapsed && 'lg:[--shell-sidebar-w:240px]'
            )}
        >
            {onboarded && <ProviderStatusBanner />}
            {sidebar ? (
                <div className="flex min-h-0 flex-1 gap-2">
                    {sidebar.node}
                    {grid}
                </div>
            ) : (
                grid
            )}
            {visible && <StewardDropPreview />}
        </div>
    )
}
