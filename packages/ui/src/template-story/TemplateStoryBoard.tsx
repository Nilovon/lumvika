'use client'

import type { TemplateConnector, TemplateStoryStep } from '@lumvika/contracts'
import { useEffect, useMemo, useState } from 'react'

import { cn } from '../cn'
import { IsoGrid } from '../iso-grid/IsoGrid'
import { CARD_WIDTH } from '../iso-grid/card-capture'
import { usePrefersReducedMotion } from '../iso-grid/hooks/usePrefersReducedMotion'
import { useRenderedFrame } from '../iso-grid/hooks/useRenderedFrame'
import { TILE_H } from '../iso-grid/iso'
import { type BoardAgent, type BoardFrame, buildTemplateBoard, frameTemplateBoard, tileWorldCenter, tileWorldRise } from '../iso-grid/template-board-geometry'
import type { IsoCamera, Tile } from '../iso-grid/types'
import { type StoryArtifactPlacement, StoryArtifactLayer, StoryDockedCard } from './StoryArtifactCard'
import { type StoryBoard, stageStory, storyEntranceMs, storyFrame } from './story-frame'

const NO_HIGHLIGHT: ReadonlySet<string> = new Set()

// A breath between the last cable plugging in and the first step taking over the board.
const ENTRANCE_SETTLE_MS = 500

// A close-up is framed looser than the wide shot, and never more than this much closer: a single
// agent and its tool would otherwise fill the frame with two giant diamonds and no room for the card.
const FOCUS_INSET = 0.62
const FOCUS_ZOOM_GAIN = 1.8

// Clearance between the anchor tile and the card: enough for the spinner pinned over a working agent,
// and for the hand an agent raises while it waits, which the card would otherwise cover.
const ARTIFACT_LIFT = 46
const ARTIFACT_LIFT_OVER_HAND = 92

// Rough screen height of the card, to keep it inside the frame. The same whatever the step shows: the
// actions and the result take turns in one fixed window.
const ARTIFACT_HEIGHT = 94

// A phone frame cannot hold a full-size card over the tiles: under this width the card shrinks with
// the frame, down to a floor where its text stays readable.
const ARTIFACT_FULL_SIZE_WIDTH = 640
const ARTIFACT_MIN_SCALE = 0.72

// The least height the tiles of a close-up need on screen. A frame that cannot hold that under the
// highest a card floats (over a raised hand) pins the card to its top instead, for every step alike,
// so the card does not jump between the two places from one step to the next.
const MIN_TILE_ROOM = 150
const DOCK_MARGIN = 10

// The capture the page shows before the board loads caps its zoom at CARD_MAX_ZOOM on a 1200px frame.
// The story stands further back: at the capture's ceiling a board of one agent is a single diamond
// across half the frame. A narrower frame caps the zoom in proportion.
const STORY_MAX_ZOOM = 3

function zoomCeiling(frame: BoardFrame) {
    return (STORY_MAX_ZOOM * frame.width) / CARD_WIDTH
}

function wideCamera(board: StoryBoard, frame: BoardFrame): IsoCamera {
    return frameTemplateBoard(board.tiles, frame, zoomCeiling(frame))
}

// A close-up gains on the wide shot without passing the ceiling, so a board already at the ceiling
// pans from step to step instead of pumping in and out.
function closeUpMaxZoom(wide: IsoCamera, frame: BoardFrame) {
    return Math.min(wide.zoom * FOCUS_ZOOM_GAIN, zoomCeiling(frame))
}

// A close-up keeps the room the card needs over the tiles: they are framed in what the card leaves
// of the frame, then pushed down by half of it.
function focusCamera(board: StoryBoard, tiles: Tile[], frame: BoardFrame, cardRoom: number): IsoCamera {
    const wide = wideCamera(board, frame)
    const room = Math.min(cardRoom, frame.height / 2)
    const close = frameTemplateBoard(tiles, { width: frame.width, height: frame.height - room }, closeUpMaxZoom(wide, frame), FOCUS_INSET)
    const zoom = Math.max(close.zoom, wide.zoom)
    return { zoom, pan: { x: close.pan.x, y: close.pan.y + room / 2 / zoom } }
}

// With the card pinned to the top, the tiles are framed in what it leaves, with no floor on the zoom:
// on a short frame even the wide shot has to step back to clear it.
function dockedCamera(board: StoryBoard, tiles: Tile[], frame: BoardFrame, room: number, close: boolean): IsoCamera {
    const wide = wideCamera(board, frame)
    const below = { width: frame.width, height: frame.height - room }
    const framed = close ? frameTemplateBoard(tiles, below, closeUpMaxZoom(wide, frame), FOCUS_INSET) : frameTemplateBoard(tiles, below, wide.zoom)
    return { zoom: framed.zoom, pan: { x: framed.pan.x, y: framed.pan.y + room / 2 / framed.zoom } }
}

export function TemplateStoryBoard({
    agents,
    connectors,
    steps,
    index,
    run = 0,
    playing = true,
    onEntered,
    className,
}: {
    agents: BoardAgent[]
    connectors: TemplateConnector[]
    steps: readonly TemplateStoryStep[]
    index: number
    // Bumped by the story clock on every move: a click on the step already playing replays its card.
    run?: number
    // The card's actions roll with the story and stop with it, on hover or off screen.
    playing?: boolean
    // Fired once the board has landed, which is when the caller's clock should start: a step staged
    // during the cascade would dim tiles still in the air.
    onEntered?: () => void
    className?: string
}) {
    const { ref, frame } = useRenderedFrame()
    const reducedMotion = usePrefersReducedMotion()
    const board = useMemo(() => buildTemplateBoard(agents, connectors, NO_HIGHLIGHT), [agents, connectors])
    const staged = useMemo(() => stageStory(steps, board), [steps, board])
    const [entered, setEntered] = useState(false)

    useEffect(() => {
        if (reducedMotion) {
            setEntered(true)
            return
        }
        const timer = window.setTimeout(() => setEntered(true), storyEntranceMs(board) + ENTRANCE_SETTLE_MS)
        return () => window.clearTimeout(timer)
    }, [board, reducedMotion])

    useEffect(() => {
        if (entered) onEntered?.()
    }, [entered, onEntered])

    const step = entered ? (staged[index] ?? null) : null
    const scene = useMemo(() => storyFrame(step, board, { entrance: !reducedMotion }), [step, board, reducedMotion])

    const artifact = useMemo<StoryArtifactPlacement | null>(() => {
        if (!scene.artifact || !frame) return null
        const scale = Math.min(1, Math.max(ARTIFACT_MIN_SCALE, frame.width / ARTIFACT_FULL_SIZE_WIDTH))
        const anchor = board.tiles.find(tile => tile.id === scene.artifact?.anchorTileId)
        if (!anchor) return null
        const center = tileWorldCenter(anchor)
        const overHand = step?.status === 'waiting_human' && anchor.id === step.agentKey
        const connector = scene.artifact.toolSlug ? connectors.find(c => c.slug === scene.artifact?.toolSlug) : undefined
        const agent = agents.find(a => a.key === step?.agentKey)
        return {
            key: `${scene.artifact.stepId}:${run}`,
            x: center.x,
            y: center.y - ((anchor.span ?? 2) * TILE_H) / 2 - tileWorldRise(anchor),
            lift: overHand ? ARTIFACT_LIFT_OVER_HAND : ARTIFACT_LIFT,
            scale,
            header: connector ? { name: connector.name, icon: connector.icon } : { name: agent?.name ?? '', icon: null },
            actions: scene.artifact.actions,
            result: scene.artifact.result,
        }
    }, [board, frame, scene, step, run, agents, connectors])

    const docked = artifact !== null && frame !== null && frame.height < ARTIFACT_LIFT_OVER_HAND + ARTIFACT_HEIGHT * artifact.scale + MIN_TILE_ROOM

    const camera = useMemo(() => {
        if (!frame) return null
        if (docked && artifact) {
            const focus = new Set(scene.focusTileIds)
            const room = DOCK_MARGIN * 2 + ARTIFACT_HEIGHT * artifact.scale
            return dockedCamera(
                board,
                board.tiles.filter(tile => focus.has(tile.id)),
                frame,
                room,
                step?.camera === 'agent',
            )
        }
        if (!step || step.camera === 'wide') return wideCamera(board, frame)
        const focus = new Set(scene.focusTileIds)
        const cardRoom = artifact ? artifact.lift + ARTIFACT_HEIGHT * artifact.scale : 0
        return focusCamera(
            board,
            board.tiles.filter(tile => focus.has(tile.id)),
            frame,
            cardRoom,
        )
    }, [board, frame, step, scene, artifact, docked])

    if (board.agentCount === 0) return null

    return (
        <div ref={ref} aria-hidden className={cn('relative overflow-hidden', className)}>
            {camera && (
                <IsoGrid
                    tiles={scene.tiles}
                    containers={[]}
                    liveLinks={scene.links}
                    selectedTileId={null}
                    camera={camera}
                    scrollGestures={false}
                    locked
                    canDraw={false}
                    className="size-full"
                    worldOverlay={zoom => <StoryArtifactLayer artifact={docked ? null : artifact} zoom={zoom} playing={playing} reducedMotion={reducedMotion} />}
                />
            )}
            <StoryDockedCard artifact={docked ? artifact : null} top={DOCK_MARGIN} playing={playing} reducedMotion={reducedMotion} />
        </div>
    )
}
