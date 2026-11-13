export const REVIEW_TABS = ['toReview', 'blocked', 'conversations'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

// The tab the screen opens on when the address names none: the first, in order, that holds
// something, and the first of all when every one is empty. Null while a count it needs to decide is
// still loading: a later tab is only chosen once every tab before it is known to be empty.
export function openingReviewTab(counts: Partial<Record<ReviewTab, number>>): ReviewTab | null {
    for (const tab of REVIEW_TABS) {
        const count = counts[tab]
        if (count === undefined) return null
        if (count > 0) return tab
    }
    return REVIEW_TABS[0]
}
