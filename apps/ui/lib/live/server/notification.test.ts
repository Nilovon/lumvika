import { describe, expect, it } from 'vitest'

import { parseLiveNotification } from './notification'

describe('parseLiveNotification', () => {
    it('reads a row change as the trigger writes it', () => {
        const payload = '{"op": "UPDATE", "key": {"id": "a1"}, "kind": "row", "table": "agents", "user_id": null, "workspace_id": 12}'
        expect(parseLiveNotification(payload)).toEqual({ kind: 'row', table: 'agents', op: 'UPDATE', key: { id: 'a1' }, user_id: null, workspace_id: 12 })
    })

    it('keeps the columns a delete carries', () => {
        const payload = JSON.stringify({ kind: 'row', table: 'space_members', op: 'DELETE', workspace_id: 3, user_id: 'u1', key: { space_id: 's1', user_id: 'u1' }, old: { space_id: 's1', user_id: 'u1', workspace_id: 3 } })
        expect(parseLiveNotification(payload)).toMatchObject({ op: 'DELETE', old: { workspace_id: 3 } })
    })

    it('reads a broadcast', () => {
        const payload = JSON.stringify({ kind: 'broadcast', workspace_id: 3, from: 'u1', event: 'cursor', payload: { userId: 'u1', x: 1, y: 2 } })
        expect(parseLiveNotification(payload)).toEqual({ kind: 'broadcast', workspace_id: 3, from: 'u1', event: 'cursor', payload: { userId: 'u1', x: 1, y: 2 } })
    })

    it('refuses what this version does not know', () => {
        expect(parseLiveNotification('not json')).toBeNull()
        expect(parseLiveNotification('{"kind":"row","table":"user_phones","op":"INSERT","workspace_id":null,"user_id":"u","key":{"id":"x"}}')).toBeNull()
        expect(parseLiveNotification('{"kind":"broadcast","workspace_id":3,"from":"u","event":"chat","payload":{}}')).toBeNull()
        expect(parseLiveNotification('{"kind":"row","table":"agents","op":"TRUNCATE","workspace_id":1,"user_id":null,"key":{}}')).toBeNull()
    })
})
