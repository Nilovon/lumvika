import { describe, expect, it } from 'vitest'

import { readPlan } from '@/components/steward/widgets/plan-card'
import { AGENT_SPAN } from '@/lib/board/iso'
import { findRadialRect, type SpaceRect } from '@/lib/board/space-layout'

import { isPlanPreviewId, planCardScene, planScene, settledPlanScene } from './plan-scene'

// What this file is really holding: the preview has to be the board the plan produces, not a
// drawing of it. So the Boxes are checked against the very function createBoxes calls, and the
// agents against the walls of their own Box.

const ORGANISATION = readPlan({
    title: 'Retalk, laid out on Lumvika',
    boxes: [{ name: 'Marketing', role: 'Everything that brings people in' }, { name: 'Sales' }, { name: 'Finance' }],
    items: [
        { kind: 'agent', name: 'Content Writer', role: 'Writes and publishes', box: 'Marketing', tools: ['notion'] },
        { kind: 'agent', name: 'Social Manager', role: 'Posts every day', box: 'Marketing' },
        { kind: 'agent', name: 'Lead Follow-up', role: 'Answers new leads', box: 'Sales' },
    ],
})

const rectOf = (container: { col_start: number; row_start: number; col_end: number; row_end: number }): SpaceRect => ({
    col_start: container.col_start,
    row_start: container.row_start,
    col_end: container.col_end,
    row_end: container.row_end,
})

describe('planScene', () => {
    it('lands the Boxes exactly where createBoxes will put them', () => {
        const scene = planScene(ORGANISATION)

        const expected: SpaceRect[] = []
        for (let index = 0; index < ORGANISATION.groups.length; index++) {
            const rect = findRadialRect(expected)
            expected.push({ col_start: rect.colStart, row_start: rect.rowStart, col_end: rect.colEnd, row_end: rect.rowEnd })
        }

        expect(scene.containers.map(rectOf)).toEqual(expected)
        expect(scene.containers.map(container => container.label)).toEqual(['Marketing', 'Sales', 'Finance'])
    })

    it('keeps every agent inside the walls of its own division', () => {
        const scene = planScene(ORGANISATION)

        for (const tile of scene.tiles) {
            const container = scene.containers.find(candidate => candidate.id === tile.containerId)
            expect(container).toBeDefined()
            expect(tile.position.col).toBeGreaterThanOrEqual(container!.col_start)
            expect(tile.position.row).toBeGreaterThanOrEqual(container!.row_start)
            expect(tile.position.col + AGENT_SPAN - 1).toBeLessThanOrEqual(container!.col_end)
            expect(tile.position.row + AGENT_SPAN - 1).toBeLessThanOrEqual(container!.row_end)
        }
    })

    it('never sits two agents on the same cells', () => {
        const scene = planScene(ORGANISATION)

        for (const tile of scene.tiles) {
            for (const other of scene.tiles) {
                if (other === tile) continue
                const apart = Math.abs(tile.position.col - other.position.col) >= AGENT_SPAN || Math.abs(tile.position.row - other.position.row) >= AGENT_SPAN
                expect(apart).toBe(true)
            }
        }
    })

    // A card written before divisions existed, and the agents a model filed nowhere: they still
    // need a floor to stand on, or the tiles float over bare grid.
    it('gives a nameless list a Box of its own', () => {
        const scene = planScene(readPlan({ title: 'Your team', items: [{ kind: 'agent', name: 'Content Writer' }] }))

        expect(scene.containers).toHaveLength(1)
        expect(scene.containers[0].label).toBeNull()
        expect(scene.tiles).toHaveLength(1)
    })

    it('draws a division nobody works in yet', () => {
        const scene = planScene(readPlan({ title: 'Later on', boxes: [{ name: 'Finance', role: 'Invoices, when you are ready' }], items: [] }))

        expect(scene.containers).toHaveLength(1)
        expect(scene.tiles).toEqual([])
    })

    // Six divisions and three agents is the real shape of the funnel, and the one the rosette has
    // to hold: three Boxes are drawn empty.
    it('holds six divisions around the first one', () => {
        const scene = planScene(
            readPlan({
                title: 'Your company',
                boxes: ['Marketing', 'Sales', 'Support', 'Finance', 'Operations', 'Website'].map(name => ({ name })),
                items: [{ kind: 'agent', name: 'Content Writer', box: 'Marketing' }],
            })
        )

        expect(scene.containers).toHaveLength(6)
        expect(new Set(scene.containers.map(container => container.id)).size).toBe(6)
    })

    // Same plan, same scene: an unchanged tile has to keep the animation shorthand it was mounted
    // with, or every redraw restages the whole board.
    it('is the same scene twice over', () => {
        expect(planScene(ORGANISATION)).toEqual(planScene(ORGANISATION))
    })

    // A division added at the top used to shift every key below it, so five Boxes nobody touched
    // vanished for a frame and traced themselves again, each behind its own cascade delay.
    it('keeps the identity of the divisions a new one pushes down', () => {
        const before = planScene(ORGANISATION)
        const after = planScene(
            readPlan({
                title: ORGANISATION.title,
                boxes: [{ name: 'Founders' }, { name: 'Marketing' }, { name: 'Sales' }, { name: 'Finance' }],
                items: [
                    { kind: 'agent', name: 'Content Writer', box: 'Marketing' },
                    { kind: 'agent', name: 'Social Manager', box: 'Marketing' },
                    { kind: 'agent', name: 'Lead Follow-up', box: 'Sales' },
                ],
            })
        )

        expect(after.containers.map(container => container.id)).toContain(before.containers[0].id)
        expect(after.tiles.map(tile => tile.id).sort()).toEqual(before.tiles.map(tile => tile.id).sort())
    })

    it('marks every piece of the preview as one', () => {
        const scene = planScene(ORGANISATION)

        expect(scene.containers.every(container => isPlanPreviewId(container.id))).toBe(true)
        expect(scene.tiles.every(tile => isPlanPreviewId(tile.id))).toBe(true)
        expect(isPlanPreviewId('__placeholder__')).toBe(false)
    })

    // The handover: a real Box lands exactly on its ghost, so the ghost goes and the divisions
    // after it keep the place the server is about to give them.
    it('stops drawing a division a real Box now stands on', () => {
        const whole = planScene(ORGANISATION)
        const first = whole.containers[0]
        const partial = planScene(ORGANISATION, { built: [{ col_start: first.col_start, row_start: first.row_start, col_end: first.col_end, row_end: first.row_end }] })

        expect(partial.containers.map(container => container.id)).toEqual(whole.containers.slice(1).map(container => container.id))
        expect(partial.containers.map(rectOf)).toEqual(whole.containers.slice(1).map(rectOf))
        expect(partial.tiles.every(tile => tile.containerId !== first.id)).toBe(true)
    })

    it('has nothing left to draw once every division is built', () => {
        const whole = planScene(ORGANISATION)
        const built = whole.containers.map(rectOf)

        expect(planScene(ORGANISATION, { built })).toMatchObject({ containers: [], tiles: [] })
    })

    it('stages the Boxes before the agents that fill them', () => {
        const scene = planScene(ORGANISATION)

        const boxDelays = scene.containers.map(container => container.dropDelay ?? 0)
        expect(boxDelays).toEqual([...boxDelays].sort((a, b) => a - b))
        for (const tile of scene.tiles) {
            const container = scene.containers.find(candidate => candidate.id === tile.containerId)!
            expect(tile.dropDelay).toBeGreaterThan(container.dropDelay ?? 0)
        }
        expect(scene.landedAt).toBeGreaterThan(Math.max(...scene.tiles.map(tile => tile.dropDelay ?? 0)))
    })

    // Reduced motion: nothing to wait for, so nothing to settle either.
    it('is simply there under reduced motion', () => {
        const scene = planScene(ORGANISATION, { animated: false })

        expect(scene.landedAt).toBe(0)
        expect(scene.tiles.every(tile => !tile.justPlaced)).toBe(true)
        expect(scene.containers.every(container => !container.justPlaced)).toBe(true)
    })
})

describe('settledPlanScene', () => {
    // The tiles land at full strength and only then go translucent: agent-drop-in drives the
    // opacity to 1 and does not hold it, so the mock-up cannot be declared before the fall.
    it('turns the landed board into a mock-up without moving anything', () => {
        const scene = planScene(ORGANISATION)
        const settled = settledPlanScene(scene)

        expect(scene.tiles.every(tile => (tile.style.opacity ?? 1) === 1)).toBe(true)
        expect(settled.tiles.every(tile => (tile.style.opacity ?? 1) < 1)).toBe(true)
        expect(settled.tiles.every(tile => tile.style.stripes === true && tile.style.sheen === false)).toBe(true)
        expect(settled.tiles.map(tile => tile.position)).toEqual(scene.tiles.map(tile => tile.position))
    })

    // L'empreinte compte autant que les tuiles : une Box au trait plein se lit comme une région
    // déjà créée, quelle que soit l'opacité de ce qu'on a posé dedans.
    it('hollows the Boxes out instead of leaving them drawn for good', () => {
        const scene = planScene(ORGANISATION)
        const settled = settledPlanScene(scene)

        expect(scene.containers.every(container => !container.ghost)).toBe(true)
        expect(settled.containers.every(container => container.ghost)).toBe(true)
        expect(settled.containers.map(container => container.col_start)).toEqual(scene.containers.map(container => container.col_start))
    })
})

describe('planCardScene', () => {
    const [marketing, , finance] = ORGANISATION.groups

    it('stands every agent of the division inside its Box, clear of the four corners', () => {
        const { containers, tiles } = planCardScene(marketing)
        const [box] = containers
        const corners = [
            [box.col_start, box.row_start],
            [box.col_start, box.row_end],
            [box.col_end, box.row_start],
            [box.col_end, box.row_end],
        ]

        expect(tiles).toHaveLength(2)
        for (const tile of tiles) {
            const cells = Array.from({ length: AGENT_SPAN * AGENT_SPAN }, (_, index) => [tile.position.col + (index % AGENT_SPAN), tile.position.row + Math.floor(index / AGENT_SPAN)])
            for (const [col, row] of cells) {
                expect(col).toBeGreaterThanOrEqual(box.col_start)
                expect(col).toBeLessThanOrEqual(box.col_end)
                expect(row).toBeGreaterThanOrEqual(box.row_start)
                expect(row).toBeLessThanOrEqual(box.row_end)
                expect(corners).not.toContainEqual([col, row])
            }
        }
    })

    it('keys its pieces by rank, so a name still streaming in does not remount its tile', () => {
        const partial = planCardScene({ ...marketing, items: [{ ...marketing.items[0], name: 'Cont' }] })
        const whole = planCardScene({ ...marketing, items: [marketing.items[0]] })
        expect(partial.tiles.map(tile => tile.id)).toEqual(whole.tiles.map(tile => tile.id))
    })

    it('draws an empty division as a ghost Box the size of one agent', () => {
        const { containers, tiles } = planCardScene(finance)
        expect(tiles).toEqual([])
        expect(containers[0]).toMatchObject({ ghost: true, label: 'Finance' })
        const [single] = planCardScene({ ...finance, items: [marketing.items[0]] }).containers
        expect([containers[0].col_end, containers[0].row_end]).toEqual([single.col_end, single.row_end])
    })
})
