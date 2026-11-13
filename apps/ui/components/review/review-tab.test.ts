import { describe, expect, it } from 'vitest'

import { openingReviewTab } from './review-tab'

describe('openingReviewTab', () => {
    it('opens on the first tab that holds something, in order', () => {
        expect(openingReviewTab({ toReview: 2, blocked: 1, conversations: 3 })).toBe('toReview')
        expect(openingReviewTab({ toReview: 0, blocked: 1, conversations: 3 })).toBe('blocked')
        expect(openingReviewTab({ toReview: 0, blocked: 0, conversations: 3 })).toBe('conversations')
    })

    it('opens on To review when everything is empty', () => {
        expect(openingReviewTab({ toReview: 0, blocked: 0, conversations: 0 })).toBe('toReview')
    })

    it('decides as soon as an earlier tab holds something, whatever is still loading after it', () => {
        expect(openingReviewTab({ toReview: 1 })).toBe('toReview')
        expect(openingReviewTab({ toReview: 0, blocked: 2 })).toBe('blocked')
    })

    it('waits while a tab before the first with items is still loading', () => {
        expect(openingReviewTab({})).toBeNull()
        expect(openingReviewTab({ blocked: 2, conversations: 1 })).toBeNull()
        expect(openingReviewTab({ toReview: 0, blocked: 0 })).toBeNull()
    })
})
