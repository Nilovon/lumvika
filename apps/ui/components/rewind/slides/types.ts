import type { RewindPayload } from '@lumvika/contracts'

export type RewindSlideProps = {
    payload: RewindPayload
    agentName: (agentId: string) => string
    onReplay: () => void
    onClose: () => void
    // Mirrors the `rewind-wide` CSS variant, for what CSS cannot size (the iso board camera).
    wide: boolean
}
