import { describe, expect, it } from 'vitest'

import { createLiveHub, type LiveEvent } from './hub'

function recorder() {
    const events: LiveEvent[] = []
    return { events, send: (event: LiveEvent) => events.push(event) }
}

describe('live hub', () => {
    it('finds the streams of a workspace and those of a user, once each', () => {
        const hub = createLiveHub()
        const alice = hub.add('alice', [1, 2], recorder().send)
        const bob = hub.add('bob', [2], recorder().send)
        hub.add('carol', [3], recorder().send)

        expect(hub.audience({ workspaceId: 2 })).toEqual(new Set([alice, bob]))
        expect(hub.audience({ workspaceId: 1, userId: 'alice' })).toEqual(new Set([alice]))
        expect(hub.audience({ userId: 'bob' })).toEqual(new Set([bob]))
        expect(hub.audience({ workspaceId: 9 })).toEqual(new Set())
    })

    it('follows a membership that opens or closes while the stream is open', () => {
        const hub = createLiveHub()
        const alice = hub.add('alice', [1], recorder().send)
        alice.join(4)
        expect(hub.audience({ workspaceId: 4 })).toEqual(new Set([alice]))
        alice.leave(1)
        expect(hub.audience({ workspaceId: 1 })).toEqual(new Set())
        expect([...alice.workspaces]).toEqual([4])
    })

    it('forgets a removed stream everywhere', () => {
        const hub = createLiveHub()
        const alice = hub.add('alice', [1], recorder().send)
        alice.remove()
        alice.join(2)
        expect(hub.audience({ workspaceId: 1, userId: 'alice' })).toEqual(new Set())
        expect(hub.audience({ workspaceId: 2 })).toEqual(new Set())
        expect(hub.size()).toBe(0)
    })

    it('tells every stream to resync', () => {
        const hub = createLiveHub()
        const first = recorder()
        const second = recorder()
        hub.add('alice', [1], first.send)
        hub.add('bob', [], second.send)
        hub.resync()
        expect(first.events).toEqual([{ kind: 'resync' }])
        expect(second.events).toEqual([{ kind: 'resync' }])
    })
})
