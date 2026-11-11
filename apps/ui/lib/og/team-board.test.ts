import { describe, expect, it, vi } from 'vitest'
import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { boardStatusOfKind, loadTeam, teamBoardScene } = await import('./team-board')

const agent = (id: string, name = id) => ({ id, name })

describe('teamBoardScene', () => {
    it('puts a whole team in the one status the message is about', () => {
        expect(teamBoardScene([agent('a', 'Scout'), agent('b', 'Writer')], 'offline')).toEqual({
            agents: [
                { name: 'Scout', status: 'offline' },
                { name: 'Writer', status: 'offline' },
            ],
        })
    })

    it('puts the coworkers a message is about first, and leaves the others without a status', () => {
        const team = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'late'].map(id => agent(id))

        const { agents } = teamBoardScene(team, { late: 'waiting_human' })

        expect(agents).toHaveLength(8)
        expect(agents[0]).toEqual({ name: 'late', status: 'waiting_human' })
        expect(agents.slice(1).every(entry => entry.status === undefined)).toBe(true)
    })

    it('stands a nameless coworker on the board of an empty workspace', () => {
        expect(teamBoardScene([], 'working')).toEqual({ agents: [{ name: 'Your coworker', status: 'working' }] })
    })

    it('cuts a name to what a tile label holds', () => {
        expect(teamBoardScene([agent('a', 'x'.repeat(60))], 'idle').agents[0].name).toHaveLength(40)
    })
})

describe('boardStatusOfKind', () => {
    it('reads a notification as the state its coworker is left in', () => {
        expect(boardStatusOfKind('question')).toBe('waiting_human')
        expect(boardStatusOfKind('approval')).toBe('waiting_human')
        expect(boardStatusOfKind('connector')).toBe('waiting_human')
        expect(boardStatusOfKind('error')).toBe('error')
        expect(boardStatusOfKind('done')).toBe('idle')
        expect(boardStatusOfKind('info')).toBe('working')
    })
})

describe('loadTeam', () => {
    it('reads a coworker past the eighth when the message is about it', async () => {
        db.answer(call => {
            const byId = Array.isArray((call.args[1] as { id?: unknown }).id)
            return { data: byId ? [agent('late', 'Late Hire')] : [agent('a', ' Scout '), agent('b', '  ')] }
        })

        await expect(loadTeam(fakeScope('service'), 7, ['a', 'late'])).resolves.toEqual([agent('a', 'Scout'), agent('late', 'Late Hire')])
    })
})
