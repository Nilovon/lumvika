// A cursor moves up to 20 times a second: the membership is read once in a while rather than on
// every move, and a sender past its budget is refused without a read at all.
type GuardOptions = {
    isMember: (userId: string, workspaceId: number) => Promise<boolean>
    membershipTtlMs?: number
    perSecond?: number
    now?: () => number
}

export type BroadcastVerdict = 'allowed' | 'forbidden' | 'limited'

export function createBroadcastGuard({ isMember, membershipTtlMs = 30_000, perSecond = 40, now = Date.now }: GuardOptions) {
    const memberships = new Map<string, { member: boolean; until: number }>()
    const windows = new Map<string, { start: number; count: number }>()

    function withinBudget(userId: string): boolean {
        const at = now()
        const window = windows.get(userId)
        if (!window || at - window.start >= 1000) {
            windows.set(userId, { start: at, count: 1 })
            if (windows.size > 10_000) for (const [id, old] of windows) if (at - old.start >= 1000) windows.delete(id)
            return true
        }
        window.count += 1
        return window.count <= perSecond
    }

    async function member(userId: string, workspaceId: number): Promise<boolean> {
        const key = `${userId}:${workspaceId}`
        const cached = memberships.get(key)
        if (cached && cached.until > now()) return cached.member
        const fresh = await isMember(userId, workspaceId)
        memberships.set(key, { member: fresh, until: now() + membershipTtlMs })
        if (memberships.size > 10_000) for (const [id, entry] of memberships) if (entry.until <= now()) memberships.delete(id)
        return fresh
    }

    return {
        async check(userId: string, workspaceId: number): Promise<BroadcastVerdict> {
            if (!withinBudget(userId)) return 'limited'
            return (await member(userId, workspaceId)) ? 'allowed' : 'forbidden'
        },
    }
}
