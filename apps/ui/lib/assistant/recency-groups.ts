import type { AssistantChat } from '@lumvika/contracts'

export type RecencyGroup = 'today' | 'yesterday' | 'previous7' | 'previous30' | 'older'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function recencyGroupOf(at: string, now: Date): RecencyGroup {
    const days = Math.floor((startOfDay(now) - startOfDay(new Date(at))) / DAY_MS)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return 'previous7'
    if (days < 30) return 'previous30'
    return 'older'
}

export const activityOf = (chat: AssistantChat) => chat.lastMessageAt ?? chat.createdAt

// The chats in the order the list draws them, cut into the groups people know from other chat apps,
// in the viewer's own calendar days. Empty groups are left out.
export function groupByRecency(chats: AssistantChat[], now: Date = new Date()): Array<{ group: RecencyGroup; chats: AssistantChat[] }> {
    const order: RecencyGroup[] = ['today', 'yesterday', 'previous7', 'previous30', 'older']
    const buckets = new Map<RecencyGroup, AssistantChat[]>()
    const sorted = [...chats].sort((a, b) => activityOf(b).localeCompare(activityOf(a)))
    for (const chat of sorted) {
        const group = recencyGroupOf(activityOf(chat), now)
        buckets.set(group, [...(buckets.get(group) ?? []), chat])
    }
    return order.flatMap(group => (buckets.get(group)?.length ? [{ group, chats: buckets.get(group)! }] : []))
}

export function matchesQuery(chat: AssistantChat, query: string): boolean {
    const needle = query.trim().toLocaleLowerCase()
    return !needle || chat.title.toLocaleLowerCase().includes(needle)
}
