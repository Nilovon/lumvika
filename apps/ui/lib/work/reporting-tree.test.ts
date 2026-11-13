import { describe, expect, it } from 'vitest'

import { buildReportingTree, closesReportingLoop, countReportingNodes, directReportCounts, reportIds, type ReportingLine } from './reporting-tree'

const line = (id: string, reportsToAgentId: string | null = null): ReportingLine => ({ id, reportsToAgentId })

// ceo ← cto ← dev1, dev2 ; ceo ← cmo
const ORG = [line('ceo'), line('cto', 'ceo'), line('dev1', 'cto'), line('dev2', 'cto'), line('cmo', 'ceo'), line('solo')]

const shape = (nodes: ReturnType<typeof buildReportingTree>): unknown => nodes.map(node => [node.coworker.id, shape(node.reports)])

describe('buildReportingTree', () => {
    it('hangs every coworker under its manager, roots first', () => {
        expect(shape(buildReportingTree(ORG))).toEqual([
            ['ceo', [['cto', [['dev1', []], ['dev2', []]]], ['cmo', []]]],
            ['solo', []],
        ])
    })

    it('treats a manager missing from the list as no manager', () => {
        expect(shape(buildReportingTree([line('dev', 'hidden')]))).toEqual([['dev', []]])
    })

    it('keeps every coworker of a loop instead of dropping them', () => {
        const tree = buildReportingTree([line('a', 'b'), line('b', 'a'), line('c', 'c')])
        expect(countReportingNodes(tree)).toBe(3)
    })
})

describe('reportIds and closesReportingLoop', () => {
    it('lists the reports under a coworker at every depth', () => {
        expect([...reportIds(ORG, 'ceo')].sort()).toEqual(['cmo', 'cto', 'dev1', 'dev2'])
        expect(reportIds(ORG, 'dev1').size).toBe(0)
    })

    it('refuses a manager that is the coworker itself or one of its reports', () => {
        expect(closesReportingLoop(ORG, 'cto', 'cto')).toBe(true)
        expect(closesReportingLoop(ORG, 'ceo', 'dev2')).toBe(true)
        expect(closesReportingLoop(ORG, 'dev2', 'cmo')).toBe(false)
        expect(closesReportingLoop(ORG, 'ceo', null)).toBe(false)
    })

    it('counts direct reports only', () => {
        expect(Object.fromEntries(directReportCounts(ORG))).toEqual({ ceo: 2, cto: 2 })
    })
})
