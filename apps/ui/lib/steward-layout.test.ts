import { describe, expect, it } from 'vitest'
import {
    DEFAULT_STEWARD_PLACEMENT,
    type StewardPlacement,
    clampStewardDockWidth,
    clampStewardFloatSize,
    dockedStewardSide,
    parseStewardPlacement,
    resolveCorner,
    resolveDropTarget,
    serializeStewardPlacement,
} from './steward-layout'

const viewport = { width: 1440, height: 900 }
const size = { width: 480, height: 720, dockWidth: 480 }

describe('placement serialization', () => {
    it('round-trips docks and floating corners with their size', () => {
        const placements: StewardPlacement[] = [
            { mode: 'dock', side: 'left', ...size },
            { mode: 'dock', side: 'right', width: 520, height: 640, dockWidth: 620 },
            { mode: 'float', corner: 'top-left', ...size },
            { mode: 'float', corner: 'bottom-right', width: 400, height: 500, dockWidth: 400 },
        ]
        for (const placement of placements) expect(parseStewardPlacement(serializeStewardPlacement(placement))).toEqual(placement)
    })

    it('rejects anything it did not write', () => {
        expect(parseStewardPlacement(undefined)).toBeNull()
        expect(parseStewardPlacement('')).toBeNull()
        expect(parseStewardPlacement('dock-top-left:480x720')).toBeNull()
        expect(parseStewardPlacement('float-left:480x720')).toBeNull()
        expect(parseStewardPlacement('float-bottom-right')).toBeNull()
    })

    it('lifts a stored size back over the minimum', () => {
        expect(parseStewardPlacement('float-top-right:100x100')).toMatchObject({ width: 360, height: 420 })
        expect(parseStewardPlacement('dock-left:480x720:100')).toMatchObject({ dockWidth: 360 })
    })

    it('reads a placement stored before the dock width, at the default width', () => {
        expect(parseStewardPlacement('dock-right:520x640')).toEqual({ mode: 'dock', side: 'right', width: 520, height: 640, dockWidth: 480 })
    })
})

describe('resolveCorner', () => {
    it('picks the quadrant of the point', () => {
        expect(resolveCorner({ x: 100, y: 100 }, viewport)).toBe('top-left')
        expect(resolveCorner({ x: 1300, y: 100 }, viewport)).toBe('top-right')
        expect(resolveCorner({ x: 100, y: 800 }, viewport)).toBe('bottom-left')
        expect(resolveCorner({ x: 1300, y: 800 }, viewport)).toBe('bottom-right')
    })
})

describe('resolveDropTarget', () => {
    it('docks when the pointer touches a side of the screen', () => {
        expect(resolveDropTarget({ pointer: { x: 20, y: 450 }, panelCenter: { x: 260, y: 450 }, viewport, size })).toEqual({ mode: 'dock', side: 'left', ...size })
        expect(resolveDropTarget({ pointer: { x: 1420, y: 450 }, panelCenter: { x: 1180, y: 450 }, viewport, size })).toEqual({ mode: 'dock', side: 'right', ...size })
    })

    it('floats to the corner of the window center everywhere else', () => {
        expect(resolveDropTarget({ pointer: { x: 500, y: 40 }, panelCenter: { x: 700, y: 400 }, viewport, size })).toEqual({ mode: 'float', corner: 'top-left', ...size })
        expect(resolveDropTarget({ pointer: { x: 900, y: 40 }, panelCenter: { x: 1000, y: 500 }, viewport, size })).toEqual({ mode: 'float', corner: 'bottom-right', ...size })
    })
})

describe('clampStewardFloatSize', () => {
    it('keeps the window between its minimum and the screen', () => {
        expect(clampStewardFloatSize({ width: 100, height: 100 }, viewport)).toEqual({ width: 360, height: 420 })
        expect(clampStewardFloatSize({ width: 3000, height: 3000 }, viewport)).toEqual({ width: 1390, height: 850 })
    })
})

describe('clampStewardDockWidth', () => {
    it('keeps the dock between its minimum and a share of the screen', () => {
        expect(clampStewardDockWidth(100, 1440)).toBe(360)
        expect(clampStewardDockWidth(560, 1440)).toBe(560)
        expect(clampStewardDockWidth(3000, 1440)).toBe(800)
        expect(clampStewardDockWidth(900, 1000)).toBe(600)
    })
})

describe('dockedStewardSide', () => {
    const left: StewardPlacement = { mode: 'dock', side: 'left', ...size }
    const floating: StewardPlacement = { mode: 'float', corner: 'top-right', ...size }

    it('opens a track only for an open, docked column at rest', () => {
        expect(dockedStewardSide({ open: true, placement: left, dragging: false })).toBe('left')
        expect(dockedStewardSide({ open: null, placement: DEFAULT_STEWARD_PLACEMENT, dragging: false })).toBe('right')
        expect(dockedStewardSide({ open: false, placement: left, dragging: false })).toBeNull()
        expect(dockedStewardSide({ open: true, placement: left, dragging: true })).toBeNull()
        expect(dockedStewardSide({ open: true, placement: floating, dragging: false })).toBeNull()
    })
})
