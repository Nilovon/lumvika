import type { OrgChartCoworker } from '@/app/api/_services/work/org-chart.service'
import type { AgentStatus } from '@/lib/board/types'
import type { BadgeTone } from '@lumvika/ui/primitives'

export type OrgStatus = AgentStatus | 'disabled'

// A coworker as the chart draws it: its row, its live status from the board (null when the board
// does not hold it, a Box the reader cannot see) and how many report to it directly.
export type OrgCoworker = OrgChartCoworker & { status: OrgStatus | null; reportCount: number }

export const ORG_STATUS_TONES: Record<OrgStatus, BadgeTone> = {
    idle: 'neutral',
    working: 'green',
    waiting_human: 'orange',
    error: 'red',
    offline: 'neutral',
    disabled: 'neutral',
}

export function coworkerHref(agentId: string): string {
    return `/?agent=${encodeURIComponent(agentId)}`
}
