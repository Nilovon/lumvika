'use client'

import type { Tile } from '@lumvika/ui/iso-grid'
import { IsoGrid, frameTemplateBoard, useRenderedFrame } from '@lumvika/ui/iso-grid'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AuthStage, StageStatus } from './auth-stage-board'
import { useAuthStage } from './useAuthStage'

// Le décor d'auth tel que l'app iOS le montre au-dessus de sa feuille de connexion, chargé dans une
// WebView. La scène est celle du web ; seule la caméra change. Les quatre boxes y sont posées en
// paysage, aux coins d'un écran large, et un cadre portrait de téléphone qui les ferait tenir toutes
// les quatre les réduirait à des miettes. La caméra fait donc le plan large le temps que le plateau
// atterrisse, puis va de box en box, toujours vers celle qui travaille le plus.

const MAX_ZOOM = 1.6
const WIDE_MAX_ZOOM = 1
// Assez long pour lire ce qui se passe dans une box avant d'en partir, et pour que la caméra ne
// coure pas après chaque image du scénario.
const DWELL_MS = 9000
const CAMERA_TRANSITION_MS = 1800

const MASK = 'radial-gradient(ellipse 78% 70% at 50% 50%, black 62%, transparent 100%)'

type ReactNativeHost = { postMessage: (message: string) => void }

function boxTiles(stage: AuthStage): Map<string, Tile[]> {
    const agentBox = new Map<string, string>()
    for (const tile of stage.tiles) if (tile.containerId) agentBox.set(tile.id, tile.containerId)
    const connectorBox = new Map<string, string>()
    for (const link of stage.links) {
        const box = agentBox.get(link.source)
        if (link.variant === 'cable' && box) connectorBox.set(link.target, box)
    }
    const out = new Map<string, Tile[]>()
    for (const tile of stage.tiles) {
        const box = agentBox.get(tile.id) ?? connectorBox.get(tile.id)
        if (!box) continue
        out.set(box, [...(out.get(box) ?? []), tile])
    }
    return out
}

function busiestBox(stage: AuthStage, statuses: Record<string, StageStatus>, current: string | null): string | null {
    const lit = new Map<string, number>()
    for (const tile of stage.tiles) {
        const status = statuses[tile.id]
        if (!tile.containerId || !status || status === 'idle') continue
        lit.set(tile.containerId, (lit.get(tile.containerId) ?? 0) + 1)
    }
    let best = current
    let bestCount = current ? (lit.get(current) ?? 0) : 0
    for (const [box, count] of lit) {
        if (count > bestCount) {
            best = box
            bestCount = count
        }
    }
    return best
}

export function AppAuthBoard() {
    const { stage, tiles, links, statuses, animated } = useAuthStage()
    const { ref, frame } = useRenderedFrame()
    const tilesByBox = useMemo(() => boxTiles(stage), [stage])
    const [focusedBox, setFocusedBox] = useState<string | null>(null)

    const statusesRef = useRef(statuses)
    useEffect(() => {
        statusesRef.current = statuses
    }, [statuses])

    useEffect(() => {
        if (!animated) return
        let timer: ReturnType<typeof setTimeout>
        const refocus = () => {
            setFocusedBox(current => busiestBox(stage, statusesRef.current, current) ?? stage.containers[0]?.id ?? null)
            timer = setTimeout(refocus, DWELL_MS)
        }
        timer = setTimeout(refocus, stage.script.startAt)
        return () => clearTimeout(timer)
    }, [animated, stage])

    const camera = useMemo(() => {
        if (!frame) return null
        const focused = focusedBox ? tilesByBox.get(focusedBox) : undefined
        return focused ? frameTemplateBoard(focused, frame, MAX_ZOOM) : frameTemplateBoard(stage.tiles, frame, WIDE_MAX_ZOOM)
    }, [frame, focusedBox, tilesByBox, stage])

    const mounted = camera !== null
    useEffect(() => {
        if (!mounted) return
        const host = (window as Window & { ReactNativeWebView?: ReactNativeHost }).ReactNativeWebView
        if (!host) return
        // Deux images : la première pose la grille, la seconde est la première peinte.
        const raf = requestAnimationFrame(() => requestAnimationFrame(() => host.postMessage(JSON.stringify({ type: 'ready' }))))
        return () => cancelAnimationFrame(raf)
    }, [mounted])

    return (
        <div ref={ref} className="absolute inset-0">
            {camera && (
                <IsoGrid
                    tiles={tiles}
                    containers={stage.containers}
                    liveLinks={links}
                    selectedTileId={null}
                    camera={camera}
                    cameraTransitionMs={CAMERA_TRANSITION_MS}
                    mask={MASK}
                    scrollGestures={false}
                    canDraw={false}
                />
            )}
        </div>
    )
}
