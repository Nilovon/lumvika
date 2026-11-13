import { describe, expect, it } from 'vitest'

import type { IsoAgent } from '@/lib/board/types'
import { coworkersNow } from './coworker-states'

function agent(id: string, status: IsoAgent['status'], disabledAt: string | null = null): IsoAgent {
    return { id, name: id, handle: null, description: null, templateId: null, status, position: { col: 0, row: 0 }, workspaceId: 1, spaceId: 's', disabledAt, disabledReason: null }
}

describe('coworkersNow', () => {
    it('reads a checkout as working and orders working, waiting, error, idle, off', () => {
        const now = coworkersNow(
            [agent('idle', 'idle'), agent('off', 'idle', '2026-11-01T00:00:00.000Z'), agent('asks', 'waiting_human'), agent('busy', 'working'), agent('holder', 'idle'), agent('broken', 'error'), agent('away', 'offline')],
            [{ agentId: 'holder', issueId: 'i', ref: 'WEB-5', title: 'Research', checkedOutAt: null }],
        )
        expect(now.map(item => [item.agent.id, item.state])).toEqual([
            ['busy', 'working'],
            ['holder', 'working'],
            ['asks', 'waiting'],
            ['broken', 'error'],
            ['idle', 'idle'],
            ['away', 'off'],
            ['off', 'off'],
        ])
        expect(now[1].checkout?.ref).toBe('WEB-5')
    })
})
