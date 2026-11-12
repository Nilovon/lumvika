// The reporting line of a workspace's coworkers, read as a tree. Pure: the org chart service builds
// it on the server, the screen walks it again to know which managers a coworker may pick.

export type ReportingLine = { id: string; reportsToAgentId: string | null }

export type ReportingNode<T extends ReportingLine> = { coworker: T; reports: ReportingNode<T>[] }

function reportsByManager<T extends ReportingLine>(coworkers: readonly T[]): Map<string, T[]> {
    const known = new Set(coworkers.map(coworker => coworker.id))
    const byManager = new Map<string, T[]>()
    for (const coworker of coworkers) {
        const managerId = coworker.reportsToAgentId
        if (!managerId || !known.has(managerId) || managerId === coworker.id) continue
        byManager.set(managerId, [...(byManager.get(managerId) ?? []), coworker])
    }
    return byManager
}

// Roots are the coworkers without a manager, or whose manager is not in the list (another Box the
// reader cannot see). The database refuses a loop, but a list read mid-change could still hold one:
// a coworker no root reaches is shown as a root rather than dropped.
export function buildReportingTree<T extends ReportingLine>(coworkers: readonly T[]): ReportingNode<T>[] {
    const known = new Set(coworkers.map(coworker => coworker.id))
    const byManager = reportsByManager(coworkers)
    const placed = new Set<string>()

    const grow = (coworker: T): ReportingNode<T> => {
        placed.add(coworker.id)
        const reports = (byManager.get(coworker.id) ?? []).filter(report => !placed.has(report.id))
        return { coworker, reports: reports.map(grow) }
    }

    const isRoot = (coworker: T) => !coworker.reportsToAgentId || !known.has(coworker.reportsToAgentId) || coworker.reportsToAgentId === coworker.id
    const roots = coworkers.filter(isRoot).map(grow)
    for (const coworker of coworkers) if (!placed.has(coworker.id)) roots.push(grow(coworker))
    return roots
}

export function reportIds(coworkers: readonly ReportingLine[], agentId: string): Set<string> {
    const byManager = reportsByManager(coworkers)
    const found = new Set<string>()
    const pending = [agentId]
    while (pending.length > 0) {
        const current = pending.pop() as string
        for (const report of byManager.get(current) ?? []) {
            if (found.has(report.id) || report.id === agentId) continue
            found.add(report.id)
            pending.push(report.id)
        }
    }
    return found
}

// Whether `managerId` may become the manager of `agentId`: never itself, never one of its own reports.
export function closesReportingLoop(coworkers: readonly ReportingLine[], agentId: string, managerId: string | null): boolean {
    if (!managerId) return false
    return managerId === agentId || reportIds(coworkers, agentId).has(managerId)
}

export function directReportCounts(coworkers: readonly ReportingLine[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const [managerId, reports] of reportsByManager(coworkers)) counts.set(managerId, reports.length)
    return counts
}

export function countReportingNodes<T extends ReportingLine>(nodes: readonly ReportingNode<T>[]): number {
    return nodes.reduce((total, node) => total + 1 + countReportingNodes(node.reports), 0)
}
