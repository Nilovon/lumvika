import { describe, expect, it } from 'vitest'

import { AUTH_ISO_SCRIPT } from './AuthIsoBackground'

const changes = AUTH_ISO_SCRIPT.frames.flatMap(frame =>
    frame.changes.map(change => ({ ...change, at: frame.at })),
)

describe('le scénario du petit décor auth', () => {
    it('garde chaque statut entre 10 et 30 secondes après le premier réveil', () => {
        const agents = new Set(changes.map(change => change.agent))

        for (const agent of agents) {
            const raw = changes.filter(change => change.agent === agent)
            const own = raw.filter((change, index) => index === 0 || change.status !== raw[index - 1].status)

            own.forEach((change, index) => {
                let offset = 1
                let next = own[(index + offset) % own.length]
                while (next.status === change.status && offset <= own.length) {
                    offset++
                    next = own[(index + offset) % own.length]
                }
                const wrapped = index + offset >= own.length
                const duration = next.at + (wrapped ? AUTH_ISO_SCRIPT.period : 0) - change.at
                expect(duration, `${agent} garde ${change.status} trop peu longtemps`).toBeGreaterThanOrEqual(10_000)
                expect(duration, `${agent} garde ${change.status} trop longtemps`).toBeLessThanOrEqual(30_000)
            })
        }
    })

    it('fait de chaque attente humaine une vraie porte d’approbation', () => {
        const waits = changes.filter(change => change.status === 'waiting_human')
        expect(waits).toHaveLength(3)

        for (const wait of waits) {
            const own = changes.filter(change => change.agent === wait.agent)
            const index = own.indexOf(wait)
            expect(own[index - 1]?.status, `${wait.agent} attend sans avoir travaillé`).toBe('working')
            expect(own[index + 1]?.status, `${wait.agent} ne reprend pas après l’accord`).toBe('working')
            expect(own[index + 1].at - wait.at, `${wait.agent} attend trop brièvement`).toBeGreaterThanOrEqual(10_000)
            expect(own[index + 1].at - wait.at, `${wait.agent} attend trop longtemps`).toBeLessThanOrEqual(30_000)
            expect(wait.links, `${wait.agent} garde un lien actif pendant l’attente`).toEqual([])
        }
    })

    it('montre une première décision humaine après un vrai temps de travail', () => {
        const firstWait = changes.find(change => change.status === 'waiting_human')
        expect(AUTH_ISO_SCRIPT.startAt + (firstWait?.at ?? Infinity)).toBeLessThan(12_000)
    })

    it('fait une passe lisible du scraper vers l’outreach', () => {
        const shared = AUTH_ISO_SCRIPT.frames.find(frame => {
            const links = frame.changes.flatMap(change => change.links)
            return links.length === 2 && new Set(links).size === 1
        })
        const linkedChanges = shared?.changes.filter(change => (change.links?.length ?? 0) > 0)

        expect(linkedChanges?.map(change => change.status)).toEqual(['working', 'working'])
        expect(linkedChanges?.map(change => change.agent).sort()).toEqual([
            'demo-agent-leads',
            'demo-agent-linkedin',
        ])
    })
})
