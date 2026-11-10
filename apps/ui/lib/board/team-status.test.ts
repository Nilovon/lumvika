import { describe, expect, it } from 'vitest'

import { isWaitingOnHuman, teamMemberStatus } from './team-status'

const idle = { switchedOff: false, configured: true, reachable: true, runningCount: 0, waitingCount: 0, lastFinishedStatus: 'done' }

describe('teamMemberStatus', () => {
    it('says switched off before asking anything of the machine', () => {
        expect(teamMemberStatus({ ...idle, switchedOff: true, configured: false, reachable: false })).toBe('switched_off')
    })

    it('tells a coworker never set up on the machine from one the machine did not answer for', () => {
        expect(teamMemberStatus({ ...idle, configured: false, reachable: false })).toBe('unconfigured')
        expect(teamMemberStatus({ ...idle, reachable: false, runningCount: 2 })).toBe('offline')
    })

    it('puts a run in flight ahead of a conversation waiting on a person', () => {
        expect(teamMemberStatus({ ...idle, runningCount: 1, waitingCount: 1 })).toBe('working')
        expect(teamMemberStatus({ ...idle, waitingCount: 1, lastFinishedStatus: 'error' })).toBe('waiting_human')
    })

    it('counts an error only while it is the last run that ended', () => {
        expect(teamMemberStatus({ ...idle, lastFinishedStatus: 'error' })).toBe('error')
        expect(teamMemberStatus(idle)).toBe('idle')
        expect(teamMemberStatus({ ...idle, lastFinishedStatus: null })).toBe('idle')
    })
})

describe('isWaitingOnHuman', () => {
    it('keeps every awaiting session and leaves out the rest', () => {
        expect(['waiting_human', 'awaiting_question', 'awaiting_approval', 'awaiting_connector', 'awaiting_ack'].every(status => isWaitingOnHuman(status as never))).toBe(true)
        expect(['idle', 'working', 'error'].some(status => isWaitingOnHuman(status as never))).toBe(false)
    })
})
