import { describe, expect, it } from 'vitest'
import { boxAccessFor, type SpaceGrant } from './box-access'

const open = { id: 'open', visibility: 'workspace' }
const closed = { id: 'closed', visibility: 'restricted' }
const grants: SpaceGrant[] = [
    { space_id: 'closed', user_id: 'u-use', access: 'use' },
    { space_id: 'open', user_id: 'u-manage', access: 'manage' },
]

describe('boxAccessFor', () => {
    it('gives an admin every Box to manage', () => {
        expect(boxAccessFor({ userId: 'a', role: 'admin', boxScope: 'assigned' }, closed, [])).toBe('manage')
    })

    it('lets a member scoped to all use the open Boxes only', () => {
        const member = { userId: 'm', role: 'member' as const, boxScope: 'all' as const }
        expect(boxAccessFor(member, open, grants)).toBe('use')
        expect(boxAccessFor(member, closed, grants)).toBe('none')
    })

    it('lets a member scoped to assigned reach only what is named to them', () => {
        expect(boxAccessFor({ userId: 'm', role: 'member', boxScope: 'assigned' }, open, grants)).toBe('none')
        expect(boxAccessFor({ userId: 'u-use', role: 'member', boxScope: 'assigned' }, closed, grants)).toBe('use')
        expect(boxAccessFor({ userId: 'u-manage', role: 'member', boxScope: 'assigned' }, open, grants)).toBe('manage')
    })

    it('reads nothing while the session is still loading', () => {
        expect(boxAccessFor({ userId: 'm', role: null, boxScope: null }, open, grants)).toBe('none')
        expect(boxAccessFor({ userId: null, role: 'admin', boxScope: 'all' }, open, grants)).toBe('none')
        expect(boxAccessFor({ userId: 'm', role: 'member', boxScope: 'all' }, undefined, grants)).toBe('none')
    })
})
