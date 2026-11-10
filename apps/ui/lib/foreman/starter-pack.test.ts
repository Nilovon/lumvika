import { describe, expect, it } from 'vitest'

import { installWithFocus, readStarterPack, readStarterPackAnswer, starterPackPlan } from './starter-pack'

const card = (slug: string, focus?: string) => ({ slug, promise: `Promise of ${slug}`, line: 'A line', ...(focus ? { focus } : {}), title: `Title ${slug}`, agent: `Agent ${slug}`, image: null, connectors: ['gmail'] })
const INPUT = { cards: [card('a', 'Skill A'), card('b'), card('c'), card('d')], box: 'Sales', boxes: [{ name: 'Sales' }, { name: 'Ops' }] }

describe('readStarterPack', () => {
    it('reads back the cards the app wrote, and drops a row with no slug or promise', () => {
        const read = readStarterPack({ ...INPUT, cards: [...INPUT.cards, { slug: 'x' }, { promise: 'y' }] })
        expect(read.cards.map(entry => entry.slug)).toEqual(['a', 'b', 'c', 'd'])
        expect(read.cards[0]).toEqual(card('a', 'Skill A'))
        expect(read.boxes).toEqual(INPUT.boxes)
    })

    it('keeps a capture only when it is one the card knows how to draw', () => {
        const image = { src: 'https://x/dark.png', lightSrc: 'https://x/light.png', alt: 'Board', kind: 'board' }
        expect(readStarterPack({ cards: [{ ...card('a'), image }] }).cards[0].image).toEqual(image)
        expect(readStarterPack({ cards: [{ ...card('a'), image: { src: 'https://x', kind: 'video' } }] }).cards[0].image).toBeNull()
    })
})

describe('readStarterPackAnswer', () => {
    it('reads the cards picked, the line written instead, and anything else as unanswered', () => {
        expect(readStarterPackAnswer({ answered: true, chosen: ['a', 'b'] })).toEqual({ answered: true, chosen: ['a', 'b'] })
        expect(readStarterPackAnswer({ answered: true, custom: '  Chase invoices ' })).toEqual({ answered: true, custom: 'Chase invoices' })
        expect(readStarterPackAnswer({ answered: true, chosen: [] })).toEqual({ answered: false })
        expect(readStarterPackAnswer({ answered: false, reason: 'abandoned' })).toEqual({ answered: false })
        expect(readStarterPackAnswer(undefined)).toBeNull()
    })
})

describe('starterPackPlan', () => {
    it('lays the cards picked into the Box of the pack, in the order the pack shows them', () => {
        expect(starterPackPlan(INPUT, ['b', 'a'])).toEqual({
            items: [
                { kind: 'template', slug: 'a', title: 'Agent a', focus: 'Skill A', box: 'Sales' },
                { kind: 'template', slug: 'b', title: 'Agent b', box: 'Sales' },
            ],
            boxes: INPUT.boxes,
        })
    })

    it('drops a slug the card never offered, and anything past the trial', () => {
        expect(starterPackPlan(INPUT, ['zzz']).items).toEqual([])
        expect(starterPackPlan(INPUT, ['a', 'b', 'c', 'd']).items.map(item => item.slug)).toEqual(['a', 'b', 'c'])
    })
})

describe('installWithFocus', () => {
    it('opens the install on the skill the card sold, once', () => {
        const focused = installWithFocus('## 1. Connect Gmail', 'File by what it needs')
        expect(focused.startsWith('## Start with: File by what it needs\n')).toBe(true)
        expect(focused.endsWith('## 1. Connect Gmail')).toBe(true)
        expect(installWithFocus(focused, 'Something else')).toBe(focused)
    })
})
