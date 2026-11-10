// A page of the coworker's pager: an open conversation, or the draft that ends the row.
export type ConversationPage = { key: string; sessionId: string | null }

// The open conversations in the header's order, then the draft a swipe past the last one lands on.
// A conversation born from a draft keeps that page's key, so its chat is not mounted again.
export function conversationPages(openIds: string[], bornKeys: Record<string, string>, draftKey: string): ConversationPage[] {
    return [...openIds.map(id => ({ key: bornKeys[id] ?? id, sessionId: id })), { key: draftKey, sessionId: null }]
}

export function activePageIndex(pages: ConversationPage[], activeId: string | null): number {
    const index = activeId ? pages.findIndex(page => page.sessionId === activeId) : -1
    return index >= 0 ? index : pages.length - 1
}
