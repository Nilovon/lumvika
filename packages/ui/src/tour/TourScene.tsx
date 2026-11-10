'use client'

import { IsoGrid } from '../iso-grid/IsoGrid'
import { useRenderedFrame } from '../iso-grid/hooks/useRenderedFrame'
import { cn } from '../cn'
import { useMemo } from 'react'

import { TourBoardCursors } from './TourBoardCursors'
import { TourModelPills } from './TourModelPills'
import { frameTourPhase, frameTourStage } from './tour-board'
import { tourModelShot } from './tour-models'
import { useTourStage } from './useTourStage'

// The plateau of the onboarding tour, on whatever surface plays it: the dialog that walks it slide by
// slide, the right-hand column of the Box dialogs, and the landing section that drives its phase from
// the scroll. Everything those three share lives here; what stays outside is what each of them puts
// *over* the scene, the dialog's title scrim and its fade in and out.

// Softens the four edges rather than cutting them: the outermost cables run right up to the frame,
// and a hard edge under the copy would read as a cropped screenshot.
export const TOUR_MASK = 'radial-gradient(ellipse 86% 88% at 50% 50%, black 62%, transparent 100%)'

// How long the camera takes to travel from one slide's shot to the next. Long for a camera move,
// because it is a whole scene changing plan rather than a view being nudged, and the tiles of the
// phase are held back for most of it (cf. TOUR_CAMERA_SETTLE).
const CAMERA_TRANSITION_MS = 620

export type TourSceneProps = {
    phase: number
    active: boolean
    // The strips of the frame the caller keeps out of the shot, whether it lays its own copy on them
    // (the dialog's title band) or simply wants the plateau to stand off the edge (the landing). The
    // scene is measured and anchored on what they leave free, not on the frame: fitted on the whole
    // panel it would sit half a band off, behind the very words it is meant to illustrate. The grid
    // itself still fills the frame, so a band is a margin in the framing and never a black strip.
    bandTop?: number
    bandBottom?: number
    // Forces the wide shot whatever the phase. The close-up exists to make eight tools landing at once
    // readable while a slide is being read, and a decor has nothing to read.
    wide?: boolean
    // How far the plateau framed by the wide shot goes: a scene played without the tools is fitted on
    // the bare Boxes instead.
    connectors?: boolean
    focused?: boolean
    className?: string
}

export function TourScene({ phase, active, bandTop = 0, bandBottom = 0, wide = false, connectors = true, focused, className }: TourSceneProps) {
    const { ref, frame } = useRenderedFrame()

    // The shot the phase is played in. The grid takes it as a controlled prop and glides between
    // them, but the first one is posed rather than played, so it still waits for the measurement
    // instead of mounting at the wrong zoom. Every shot is measured on the same frame, the one the
    // bands leave free.
    const stageFrame = useMemo(() => (frame ? { width: frame.width, height: Math.max(frame.height - bandTop - bandBottom, 1) } : null), [frame, bandTop, bandBottom])
    const camera = useMemo(() => (stageFrame ? (wide ? frameTourStage(stageFrame, { connectors }) : frameTourPhase(phase, stageFrame)) : null), [phase, stageFrame, wide, connectors])

    // The model badges keep a constant size on screen whatever the camera does, so where they may be
    // anchored is a question about this frame and this shot, not about the scene.
    const modelShot = useMemo(() => (camera && stageFrame ? tourModelShot(camera, stageFrame) : null), [camera, stageFrame])
    const stage = useTourStage({ phase, active, modelShot, focused: wide ? false : focused })

    // Centred on the band-free part of the frame, not on the frame: growing the box upwards under the
    // words would otherwise drag the whole scene half a band into the very fade meant to keep those
    // words readable.
    const anchorTop = frame ? `${((bandTop + (frame.height - bandTop - bandBottom) / 2) / frame.height) * 100}%` : '50%'

    return (
        <div ref={ref} aria-hidden className={cn('relative overflow-hidden', className)}>
            {camera && (
                <IsoGrid
                    tiles={stage.tiles}
                    containers={stage.containers}
                    liveLinks={stage.links}
                    // Nothing is selectable on a scene: a selection halo here reads as a UI artefact.
                    selectedTileId={null}
                    worldAnchor={{ left: '50%', top: anchorTop }}
                    camera={camera}
                    cameraTransitionMs={CAMERA_TRANSITION_MS}
                    mask={TOUR_MASK}
                    canDraw={false}
                    // The camera belongs to the phase: a drag would fight its glide, and a wheel over the
                    // scene would stop the page from scrolling.
                    locked
                    className="size-full"
                    worldOverlay={zoom => (
                        <>
                            <TourModelPills pills={stage.modelPills} zoom={zoom} />
                            <TourBoardCursors at={stage.cursorsAt} present={stage.presentIds} zoom={zoom} />
                        </>
                    )}
                />
            )}
        </div>
    )
}
