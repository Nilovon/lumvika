import { useEffect } from 'react'
import { create } from 'zustand'

// Counts the modal overlays currently drawn over the board: behind one, its animations only cost
// a backdrop blur recomputed on every frame.
type BoardCoverState = {
    covers: number
    cover: () => () => void
}

export const useBoardCoverStore = create<BoardCoverState>()(set => ({
    covers: 0,
    cover: () => {
        set(state => ({ covers: state.covers + 1 }))
        return () => set(state => ({ covers: state.covers - 1 }))
    },
}))

export function useCoverBoard() {
    const cover = useBoardCoverStore(state => state.cover)
    useEffect(() => cover(), [cover])
}
