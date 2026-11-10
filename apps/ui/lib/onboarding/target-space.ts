import { useBoardStore } from '@/stores/board.store'
import type { GridPosition, SpacePublic } from '@/lib/board/types'
import type { SpaceOffset } from '@/stores/onboarding.store'

// Turns an anchor picked during onboarding back into a grid position. The drop happened on the
// board's placeholder, so what was parked is an offset from a corner, not a coordinate.
export function rebaseOffset(offset: SpaceOffset, corner: { colStart: number; rowStart: number }): GridPosition {
    return { col: corner.colStart + offset.col, row: corner.rowStart + offset.row }
}

// Where an import lands when the workspace already has somewhere to put it: the space the user is
// looking at, else the first one. Returns null when there is none, which is what sends a visitor
// through the onboarding chain (claim a Space, then install). The whole row comes back, not just
// its id: rebasing the anchors picked during onboarding needs its corner.
//
// The hydration await is load-bearing: the board store fills in asynchronously, and reading an
// empty `spaces` array before it lands would paywall an existing customer.
export async function resolveTargetSpace(workspaceId: number): Promise<SpacePublic | null> {
    if (!useBoardStore.getState().hydrated) await useBoardStore.getState().hydrate(workspaceId)
    const { spaces, selectedSpaceId } = useBoardStore.getState()
    if (spaces.length === 0) return null
    return spaces.find(space => space.id === selectedSpaceId) ?? spaces[0]
}
