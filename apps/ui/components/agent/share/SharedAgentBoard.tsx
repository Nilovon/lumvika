'use client'

import type { TemplateAgent, TemplateConnector } from '@lumvika/contracts'
import { TemplateCardBoard } from '@lumvika/ui/iso-grid'
import { useMemo } from 'react'

const SHARE_MAX_ZOOM = 3

// The portrait a share link opens on. A template card wakes this board up under the cursor and falls
// back to its stored capture on the way out; a share has no capture and no page of its own, so the
// board is the only picture of this agent that exists and it is alive from the first frame.
//
// TemplateCardBoard rather than TemplateBoardPreview: the board is laid out at the capture's own
// 1200x630 and the whole stage is scaled down, which is the framing CARD_MAX_ZOOM was calibrated
// for. Handed this dialog's box directly, TemplateBoardPreview would clip its fit at that ceiling
// and leave the tiles at their full 1200px size inside a third of the frame.
//
// The zoom ceiling is lowered from the cards' own: a template ships a handful of connectors and the
// fit never reaches it, where a share is one agent and often a single service, which at 4.8 turns
// into one diamond filling the banner edge to edge.
export function SharedAgentBoard({ agent, connectors }: { agent: TemplateAgent; connectors: TemplateConnector[] }) {
    // buildTiles memoizes on the array itself: a literal written inline hands it a new one on every
    // render of the panel, and the entrance cascade restarts under its own feet.
    const agents = useMemo(() => [agent], [agent])

    return (
        // The background is repeated here because the board measures its frame before drawing and
        // renders nothing for one paint, which would otherwise flash the popover behind it.
        // pointer-events-none: this is a picture. IsoGrid pans under a mouse drag, and on the mobile
        // sheet a swipe belongs to the drawer rather than to the camera.
        <div className="pointer-events-none relative aspect-[1200/630] w-full shrink-0 overflow-hidden bg-[#fafafa] mask-b-from-80% dark:bg-[#0a0a0a]">
            <TemplateCardBoard agents={agents} connectors={connectors} maxZoom={SHARE_MAX_ZOOM} />
        </div>
    )
}
