import 'server-only'

import type { WorkAuthor } from '@lumvika/contracts'
import { z } from 'zod'

import { recordActivity } from '@/app/api/_services/work/activity.service'
import { dbOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError, type ErrorCode } from '@/lib/i18n/action-error'
import { closesReportingLoop } from '@/lib/work/reporting-tree'
import { selectAll, selectMaybeSingle, updateRows, type TablesUpdate } from '@/lib/db'

type AgentUpdate = TablesUpdate<'agents'>

const ORG_AGENT_COLUMNS = ['id', 'name', 'handle', 'title', 'reports_to_agent_id', 'space_id', 'disabled_at', 'created_at'] as const

export type OrgChartCoworker = {
    id: string
    name: string
    handle: string | null
    title: string | null
    reportsToAgentId: string | null
    spaceId: string
    spaceName: string | null
    disabled: boolean
}

export const coworkerReportingInputSchema = z.object({
    title: z
        .string()
        .trim()
        .max(120, { message: 'textTooLong' })
        .nullable()
        .optional()
        .transform(title => (title === '' ? null : title)),
    reportsToAgentId: z.string().min(1).nullable().optional(),
})
export type CoworkerReportingInput = z.input<typeof coworkerReportingInputSchema>

// The trigger `agents_check_reporting_line` names each refusal at the head of its message.
const TRIGGER_REFUSALS: readonly [prefix: string, code: ErrorCode][] = [
    ['agents_reports_to_self:', 'coworkerReportsToSelf'],
    ['agents_reports_to_other_workspace:', 'coworkerReportsToOtherWorkspace'],
    ['agents_reports_to_cycle:', 'coworkerReportingCycle'],
]

export function reportingRefusalOf(error: { message?: string } | null | undefined): ErrorCode | null {
    const message = error?.message ?? ''
    return TRIGGER_REFUSALS.find(([prefix]) => message.includes(prefix))?.[1] ?? null
}

// The coworkers the reader can see, with their title, manager and Box. A manager the reader cannot see
// is left unnamed: its report is drawn as a root, and nothing says someone sits above it.
export async function readOrgChart(scope: WorkScope, visible: 'all' | ReadonlySet<string>): Promise<OrgChartCoworker[]> {
    const db = dbOf(scope)
    const [agents, spaces] = await Promise.all([
        selectAll(db, 'agents', ORG_AGENT_COLUMNS, { workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true }),
        selectAll(db, 'spaces', ['id', 'name'] as const, { workspace_id: scope.workspaceId }),
    ])
    if (agents.error) throw new Error(`Failed to read the coworkers: ${agents.error.message}`)
    const spaceName = new Map((spaces.data ?? []).map(space => [space.id, space.name]))
    const seen = (agentId: string) => visible === 'all' || visible.has(agentId)
    return (agents.data ?? []).filter(agent => seen(agent.id)).map(agent => ({
        id: agent.id,
        name: agent.name,
        handle: agent.handle,
        title: agent.title,
        reportsToAgentId: agent.reports_to_agent_id && seen(agent.reports_to_agent_id) ? agent.reports_to_agent_id : null,
        spaceId: agent.space_id,
        spaceName: spaceName.get(agent.space_id) ?? null,
        disabled: !!agent.disabled_at,
    }))
}

async function readCoworker(scope: WorkScope, agentId: string) {
    const { data } = await selectMaybeSingle(dbOf(scope), 'agents', ['id', 'title', 'reports_to_agent_id'] as const, { id: agentId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('coworkerNotFound')
    return data
}

// Refused here with a clear reason before the write; the trigger still holds the line against two
// moves racing each other, and its refusal reads the same.
async function assertManagerFits(scope: WorkScope, agentId: string, managerId: string): Promise<void> {
    if (managerId === agentId) throw new AppError('coworkerReportsToSelf')
    const { data: manager } = await selectMaybeSingle(dbOf(scope), 'agents', ['id'] as const, { id: managerId, workspace_id: scope.workspaceId })
    if (!manager) throw new AppError('coworkerReportsToOtherWorkspace')
    const { data: lines, error } = await selectAll(dbOf(scope), 'agents', ['id', 'reports_to_agent_id'] as const, { workspace_id: scope.workspaceId })
    if (error) throw new Error(`Failed to read the reporting lines: ${error.message}`)
    const reporting = (lines ?? []).map(line => ({ id: line.id, reportsToAgentId: line.reports_to_agent_id }))
    if (closesReportingLoop(reporting, agentId, managerId)) throw new AppError('coworkerReportingCycle')
}

export async function setCoworkerReporting(scope: WorkScope, author: WorkAuthor, agentId: string, input: CoworkerReportingInput): Promise<void> {
    const fields = parseWorkInput(coworkerReportingInputSchema, input)
    const current = await readCoworker(scope, agentId)
    if (fields.reportsToAgentId) await assertManagerFits(scope, agentId, fields.reportsToAgentId)

    const patch: AgentUpdate = {
        ...(fields.title !== undefined && fields.title !== current.title ? { title: fields.title } : {}),
        ...(fields.reportsToAgentId !== undefined && fields.reportsToAgentId !== current.reports_to_agent_id ? { reports_to_agent_id: fields.reportsToAgentId } : {}),
    }
    if (Object.keys(patch).length === 0) return

    const { error } = await updateRows(dbOf(scope), 'agents', patch, { id: agentId, workspace_id: scope.workspaceId })
    const refusal = reportingRefusalOf(error)
    if (refusal) throw new AppError(refusal)
    if (error) throw new Error(`Failed to change the reporting line: ${error.message}`)

    await recordActivity(scope, {
        action: 'agent.reporting_changed',
        entityType: 'agent',
        entityId: agentId,
        author,
        metadata: {
            ...('title' in patch ? { title: { from: current.title, to: patch.title ?? null } } : {}),
            ...('reports_to_agent_id' in patch ? { reportsTo: { from: current.reports_to_agent_id, to: patch.reports_to_agent_id ?? null } } : {}),
        },
    })
}
