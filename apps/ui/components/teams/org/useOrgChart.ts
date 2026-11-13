'use client'

import { readOrgChartAction } from '@/app/api/_actions/org-chart.actions'
import type { OrgChartCoworker } from '@/app/api/_services/work/org-chart.service'
import type { OrgCoworker } from '@/components/teams/org/org-coworker'
import { buildReportingTree, directReportCounts } from '@/lib/work/reporting-tree'
import { useBoardStore } from '@/stores/board.store'
import { useCallback, useEffect, useMemo, useState } from 'react'

export function useOrgChart() {
    const [rows, setRows] = useState<OrgChartCoworker[] | null>(null)
    const [failed, setFailed] = useState(false)
    const agents = useBoardStore(state => state.agents)

    const apply = useCallback((result: Awaited<ReturnType<typeof readOrgChartAction>>) => {
        setFailed(!result.ok)
        if (result.ok) setRows(result.coworkers)
    }, [])

    const reload = useCallback(() => readOrgChartAction().then(apply), [apply])

    useEffect(() => {
        let active = true
        void readOrgChartAction().then(result => active && apply(result))
        return () => {
            active = false
        }
    }, [apply])

    const coworkers = useMemo<OrgCoworker[] | null>(() => {
        if (!rows) return null
        const live = new Map(agents.map(agent => [agent.id, agent]))
        const counts = directReportCounts(rows)
        return rows.map(row => {
            const agent = live.get(row.id)
            const status = row.disabled || agent?.disabledAt ? 'disabled' : (agent?.status ?? null)
            return { ...row, status, reportCount: counts.get(row.id) ?? 0 }
        })
    }, [rows, agents])

    const tree = useMemo(() => (coworkers ? buildReportingTree(coworkers) : null), [coworkers])

    return { coworkers, tree, failed, reload }
}
