'use client'

import { HScrollFade } from '@lumvika/ui/primitives'
import { useRef } from 'react'

import type { StarterPackCard as Card } from '@/lib/steward/starter-pack'
import { MAX_STARTER_PICKS } from '@/lib/onboarding/starter-packs'
import { StarterPackCard } from './StarterPackCard'
import type { StarterPicks } from './useStarterPicks'

// The cards on a rail: one on screen, the next one peeking to say it is there, an arrow on each edge
// that still hides a card. A pick scrolls on to the next card still free, so the whole pack is read
// without reaching for the arrows.

const SNAP = { behavior: 'smooth', block: 'nearest', inline: 'center' } as const

export function StarterPackRail({ cards, picks }: { cards: Card[]; picks: StarterPicks }) {
    const rail = useRef<HTMLDivElement>(null)

    const toggle = (card: Card, index: number) => {
        const wasPicked = picks.isPicked(card.slug)
        // Read before the toggle lands: a pick that takes the last place has nothing left to move to.
        const fillsTrial = picks.picked.length + 1 >= MAX_STARTER_PICKS
        picks.toggle(card.slug)
        // Dropping a card leaves the eye where it is, and a refused one stays put to show why.
        if (wasPicked || fillsTrial) return
        const next = cards.slice(index + 1).find(other => !picks.isPicked(other.slug))
        if (next) rail.current?.querySelector(`[data-slug="${next.slug}"]`)?.scrollIntoView(SNAP)
    }

    return (
        <div ref={rail}>
            <HScrollFade className="snap-x snap-mandatory gap-3 scroll-smooth pb-1" fadeClassName="from-background">
                {cards.map((card, index) => (
                    <div key={card.slug} className="flex w-[86%] max-w-80 shrink-0 snap-center">
                        <StarterPackCard card={card} picked={picks.isPicked(card.slug)} locked={picks.full && !picks.isPicked(card.slug)} onToggle={() => toggle(card, index)} className="w-full" />
                    </div>
                ))}
            </HScrollFade>
        </div>
    )
}
