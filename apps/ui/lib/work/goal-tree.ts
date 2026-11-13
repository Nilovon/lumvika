import { isIssueClosed, type Goal, type GoalStatus, type IssueCounts, type IssueStatus, type ProjectStatus } from '@lumvika/contracts'

// Goals as a tree, each with the projects linked to it and how far their issues are. Pure: the goals
// service builds it, the screen filters it.

// A cancelled issue is neither open nor done: it leaves the bar instead of holding it back.
export type GoalProgress = { open: number; done: number }

export type GoalProjectRef = { id: string; key: string; name: string; status: ProjectStatus; progress: GoalProgress }

export type GoalTreeNode = Goal & {
    projects: GoalProjectRef[]
    // The goal's own issues: those of its linked projects and those linked to it directly.
    progress: GoalProgress
    // The same, with every goal under it added.
    rollup: GoalProgress
    children: GoalTreeNode[]
}

export const NO_PROGRESS: GoalProgress = { open: 0, done: 0 }

export function progressOf(counts: IssueCounts): GoalProgress {
    let open = 0
    let done = 0
    for (const [status, count] of Object.entries(counts) as [IssueStatus, number | undefined][]) {
        if (!count) continue
        if (status === 'done') done += count
        else if (!isIssueClosed(status)) open += count
    }
    return { open, done }
}

export function addProgress(a: GoalProgress, b: GoalProgress): GoalProgress {
    return { open: a.open + b.open, done: a.done + b.done }
}

// Null when there is nothing to measure yet, which a bar shows differently from 0%.
export function progressPercent(progress: GoalProgress): number | null {
    const total = progress.open + progress.done
    return total === 0 ? null : Math.round((progress.done / total) * 100)
}

export type GoalLinks = {
    projectsByGoal: ReadonlyMap<string, GoalProjectRef[]>
    // Issues linked to a goal directly, outside any project already linked to it.
    directProgressByGoal: ReadonlyMap<string, GoalProgress>
}

// A goal whose parent is missing or loops back is drawn as a root rather than lost.
export function buildGoalTree(goals: readonly Goal[], links: GoalLinks): GoalTreeNode[] {
    const known = new Set(goals.map(goal => goal.id))
    const childrenOf = new Map<string, Goal[]>()
    for (const goal of goals) {
        if (!goal.parentGoalId || !known.has(goal.parentGoalId) || goal.parentGoalId === goal.id) continue
        childrenOf.set(goal.parentGoalId, [...(childrenOf.get(goal.parentGoalId) ?? []), goal])
    }
    const placed = new Set<string>()

    const grow = (goal: Goal): GoalTreeNode => {
        placed.add(goal.id)
        const projects = links.projectsByGoal.get(goal.id) ?? []
        const progress = projects.reduce((sum, project) => addProgress(sum, project.progress), links.directProgressByGoal.get(goal.id) ?? NO_PROGRESS)
        const children = (childrenOf.get(goal.id) ?? []).filter(child => !placed.has(child.id)).map(grow)
        const rollup = children.reduce((sum, child) => addProgress(sum, child.rollup), progress)
        return { ...goal, projects, progress, rollup, children }
    }

    const isRoot = (goal: Goal) => !goal.parentGoalId || !known.has(goal.parentGoalId) || goal.parentGoalId === goal.id
    const roots = goals.filter(isRoot).map(grow)
    for (const goal of goals) if (!placed.has(goal.id)) roots.push(grow(goal))
    return roots
}

// Whether `parentId` may hold `goalId`: never itself, never a goal already under it.
export function nestsUnderItself(goals: readonly Pick<Goal, 'id' | 'parentGoalId'>[], goalId: string, parentId: string | null): boolean {
    if (!parentId) return false
    const parentOf = new Map(goals.map(goal => [goal.id, goal.parentGoalId]))
    const seen = new Set<string>()
    let current: string | null | undefined = parentId
    while (current && !seen.has(current)) {
        if (current === goalId) return true
        seen.add(current)
        current = parentOf.get(current)
    }
    return false
}

export type GoalFilter = { statuses: readonly GoalStatus[]; teamIds: readonly string[] }

// A goal that matches keeps its whole branch above it, so it is never shown out of context. An empty
// list matches everything.
export function filterGoalTree(nodes: readonly GoalTreeNode[], filter: GoalFilter): GoalTreeNode[] {
    const matches = (node: GoalTreeNode) => (filter.statuses.length === 0 || filter.statuses.includes(node.status)) && (filter.teamIds.length === 0 || (!!node.teamId && filter.teamIds.includes(node.teamId)))
    return nodes.flatMap(node => {
        const children = filterGoalTree(node.children, filter)
        return matches(node) || children.length > 0 ? [{ ...node, children }] : []
    })
}

export function flattenGoalTree(nodes: readonly GoalTreeNode[]): GoalTreeNode[] {
    return nodes.flatMap(node => [node, ...flattenGoalTree(node.children)])
}
