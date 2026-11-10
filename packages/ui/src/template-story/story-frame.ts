import type { TemplateStoryArtifact, TemplateStoryStep } from '@lumvika/contracts'

import { agentTileStyle } from '../iso-grid/presets'
import { type buildTemplateBoard, templateLinkId } from '../iso-grid/template-board-geometry'
import type { Tile, TileLink } from '../iso-grid/types'

export type StoryBoard = ReturnType<typeof buildTemplateBoard>

// A step bound to the tiles that stage it. The tool and the handoff are nulled rather than the step
// dropped when their tile is not on the board: the connector budget can leave a tool off a crowded
// board, and the step still reads without its beam.
export type StagedStoryStep = TemplateStoryStep & { toolTileId: string | null; handoffTileId: string | null }

export function stageStory(steps: readonly TemplateStoryStep[], board: StoryBoard): StagedStoryStep[] {
    const tileIds = new Set(board.tiles.map(tile => tile.id))
    const agentKeys = new Set(board.agentKeys)
    return steps
        .filter(step => agentKeys.has(step.agentKey))
        .map(step => {
            const toolTileId = step.toolSlug ? `${step.agentKey}::${step.toolSlug}` : null
            const handoffTileId = step.handoffTo && step.handoffTo !== step.agentKey && agentKeys.has(step.handoffTo) ? step.handoffTo : null
            return { ...step, toolTileId: toolTileId && tileIds.has(toolTileId) ? toolTileId : null, handoffTileId }
        })
}

export type StoryFrame = {
    tiles: Tile[]
    links: TileLink[]
    // What the camera frames: the whole board on a wide step, the tiles the step involves otherwise.
    focusTileIds: string[]
    // The card over the step: its actions rolling by, then what it produced. Anchored on the tool
    // the agent calls, on the agent itself otherwise.
    artifact: { stepId: string; anchorTileId: string; actions: readonly string[]; result: TemplateStoryArtifact | null; toolSlug: string | null } | null
}

// The board as one step stages it. The cables are the plumbing and stay whatever happens; the step
// only adds what is an event: a beam over the cable of the tool being called, a beam to the agent
// being handed the work. Everything the step does not involve steps back, except on a wide shot,
// which is there precisely to show the whole board.
//
// `entrance` carries the cascade's delays unchanged on every frame: the CSS animation strings must
// stay identical from one render to the next, or a tile still falling would snap to rest.
export function storyFrame(step: StagedStoryStep | null, board: StoryBoard, { entrance }: { entrance: boolean }): StoryFrame {
    const involved = new Set(step ? [step.agentKey, step.toolTileId, step.handoffTileId].filter((id): id is string => id !== null) : [])
    const dimOthers = step !== null && step.camera === 'agent'

    const tiles = board.tiles.map(tile => {
        const placed: Tile = entrance ? { ...tile, justPlaced: true, dropDelay: board.dropDelays.get(tile.id) } : tile
        if (!step) return placed
        const staged: Tile = { ...placed, dimmed: dimOthers && !involved.has(tile.id), highlighted: tile.id === step.toolTileId }
        return tile.id === step.agentKey ? { ...staged, style: agentTileStyle(step.status, tile.ariaLabel ?? '') } : staged
    })

    const links: TileLink[] = board.links.map(link => (entrance ? { ...link, appearDelay: board.appearDelays.get(templateLinkId(link.source, link.target)) } : link))
    if (step?.toolTileId && step.status === 'working') links.push({ source: step.agentKey, target: step.toolTileId, variant: 'beam' })
    if (step?.handoffTileId) links.push({ source: step.agentKey, target: step.handoffTileId, variant: 'beam' })

    const focusTileIds = !step || step.camera === 'wide' ? board.tiles.map(tile => tile.id) : [...involved]
    const artifact =
        step && (step.artifact || step.actions.length > 0)
            ? {
                  stepId: step.id,
                  anchorTileId: step.toolTileId ?? step.agentKey,
                  actions: step.actions,
                  result: step.artifact,
                  toolSlug: step.toolTileId ? step.toolSlug : null,
              }
            : null

    return { tiles, links, focusTileIds, artifact }
}

// When the entrance cascade has landed: the last agent is awake, i.e. every cable is plugged in.
export function storyEntranceMs(board: StoryBoard) {
    return Math.max(0, ...board.wakeDelays.values())
}
