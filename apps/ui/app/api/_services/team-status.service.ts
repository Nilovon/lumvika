import { fetchLiveSessions } from '@/lib/board/live-sessions'
import { isWaitingOnHuman, teamMemberStatus } from '@/lib/board/team-status'
import { listRuns } from '@/lib/engine/client'
import type { EngineConnection, EngineRun } from '@/lib/engine/types'
import { projectRun } from '@/lib/mcp/run-projection'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'
import { teamNamesByAgent } from './work/teams.service'
import { findWorkspaceEngine } from './workspace-engine.service'

const TEAM_AGENT_COLUMNS = ['id', 'name', 'handle', 'title', 'space_id', 'engine_agent_id', 'disabled_at'] as const
const MAX_RUNNING_PER_AGENT = 20
// The newest run can be the one still in flight, so a few are read to find the last that ended.
const RECENT_RUNS = 5

type AgentRuns = { running: EngineRun[]; lastFinished: EngineRun | null }

type OrgPlace = { title: string | null; reportsTo: string | null; directReports: string[]; teams: string[] }

// Where each coworker sits in the organisation, named by handle (the key a coworker mentions and
// calls another by). Read across the workspace, as a manager can sit in a Box the filter left out,
// but only coworkers the caller may see are ever named.
async function readOrgPlaces(workspaceId: number, visible: 'all' | ReadonlySet<string>): Promise<(agentId: string, title: string | null) => OrgPlace> {
    const [{ data: lines }, teams] = await Promise.all([selectMany(createServiceRoleClient(), 'agents', ['id', 'name', 'handle', 'reports_to_agent_id'] as const, { workspace_id: workspaceId }, { column: 'created_at' }), teamNamesByAgent({ workspaceId })])
    const rows = (lines ?? []).filter(row => visible === 'all' || visible.has(row.id))
    const keyOf = new Map(rows.map(row => [row.id, row.handle ?? row.name]))
    return (agentId, title) => {
        const managerId = rows.find(row => row.id === agentId)?.reports_to_agent_id
        return {
            title,
            reportsTo: managerId ? (keyOf.get(managerId) ?? null) : null,
            directReports: rows.filter(row => row.reports_to_agent_id === agentId).map(row => keyOf.get(row.id) as string),
            teams: teams.get(agentId) ?? [],
        }
    }
}

// The engine's own busy flag is not used: it is one flag per coworker, and the first of two
// parallel runs to end sets it back to idle while the other still works.
async function readAgentRuns(conn: EngineConnection, engineAgentId: string): Promise<AgentRuns | null> {
    try {
        const [running, recent] = await Promise.all([listRuns(conn, engineAgentId, { status: 'running', limit: MAX_RUNNING_PER_AGENT }), listRuns(conn, engineAgentId, { limit: RECENT_RUNS })])
        return { running, lastFinished: recent.find(run => run.status !== 'running') ?? null }
    } catch {
        return null
    }
}

// `visible` is the coworkers the caller reaches (`visibleAgentIds`): the roster and the org places it
// names stay within them.
export async function readTeamStatus(workspaceId: number, { spaceId, agentId }: { spaceId?: string; agentId?: string } = {}, visible: 'all' | ReadonlySet<string> = 'all') {
    const supabase = createServiceRoleClient()
    const [{ data: allAgents }, { data: workspace }] = await Promise.all([selectMany(supabase, 'agents', TEAM_AGENT_COLUMNS, { workspace_id: workspaceId, ...(spaceId ? { space_id: spaceId } : {}), ...(agentId ? { id: agentId } : {}) }, { column: 'created_at' }), selectMaybeSingle(supabase, 'workspaces', ['boxes_disabled_at', 'boxes_archived_at'] as const, { id: workspaceId })])
    const agents = (allAgents ?? []).filter(agent => visible === 'all' || visible.has(agent.id))
    const checkedAt = new Date().toISOString()
    if (!agents.length) return { checkedAt, agents: [] }

    // A machine powered off or archived answers nothing: asking it would only spend the timeout.
    const machineDown = !!(workspace?.boxes_disabled_at || workspace?.boxes_archived_at)
    const engine = machineDown ? null : await findWorkspaceEngine(workspaceId)
    const [runsByAgent, sessions, orgPlaceOf] = await Promise.all([
        Promise.all(agents.map(agent => (engine && agent.engine_agent_id && !agent.disabled_at ? readAgentRuns(engine.conn, agent.engine_agent_id) : Promise.resolve(null)))),
        fetchLiveSessions(supabase, agents.map(agent => agent.id)),
        readOrgPlaces(workspaceId, visible),
    ])

    return {
        checkedAt,
        agents: agents.map((agent, index) => {
            const runs = runsByAgent[index]
            const waitingOn = (sessions ?? []).filter(session => session.agentId === agent.id && isWaitingOnHuman(session.status)).map(session => ({ sessionId: session.id, reason: session.status }))
            const status = teamMemberStatus({
                switchedOff: !!agent.disabled_at,
                configured: !!agent.engine_agent_id,
                reachable: !!runs,
                runningCount: runs?.running.length ?? 0,
                waitingCount: waitingOn.length,
                lastFinishedStatus: runs?.lastFinished?.status ?? null,
            })
            const lastRun = runs?.lastFinished ? projectRun(runs.lastFinished) : null
            return {
                id: agent.id,
                name: agent.name,
                handle: agent.handle,
                spaceId: agent.space_id,
                ...orgPlaceOf(agent.id, agent.title),
                status,
                running: (runs?.running ?? []).map(projectRun).map(run => ({ runId: run.runId, sessionId: run.sessionId, trigger: run.trigger, startedAt: run.startedAt, steps: run.steps })),
                waitingOn,
                lastRun: lastRun && { runId: lastRun.runId, status: lastRun.status, finishedAt: lastRun.finishedAt, error: lastRun.error },
            }
        }),
    }
}
