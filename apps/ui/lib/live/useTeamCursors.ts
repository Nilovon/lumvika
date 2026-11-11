'use client'

import { useMemberDirectory } from '@/hooks/useMemberProfiles'
import { cursorFromPayload, leavingUserId, placeCursor, type TeamCursor, type TimedCursor } from '@/lib/board/team-cursor'
import { liveStatus, subscribeLive } from '@/lib/live/client'
import { LIVE_BROADCAST_PATH, type BroadcastEvent } from '@/lib/live/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

export type { TeamCursor } from '@/lib/board/team-cursor'

const STALE_MS = 5000
const THROTTLE_MS = 50

type CursorMessage = { workspaceId: number; event: BroadcastEvent; payload: { x?: number; y?: number } }

// One request at a time: a move made while the previous one is on its way replaces the waiting one,
// so a slow network sends fewer positions instead of piling them up. A lost cursor does not matter.
function createCursorSender() {
    let inFlight = false
    let waiting: CursorMessage | null = null

    function post(message: CursorMessage) {
        inFlight = true
        fetch(LIVE_BROADCAST_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(message),
            keepalive: message.event === 'cursor-leave',
        })
            .catch(() => undefined)
            .finally(() => {
                inFlight = false
                const next = waiting
                waiting = null
                if (next) post(next)
            })
    }

    return (message: CursorMessage) => {
        if (inFlight) waiting = message
        else post(message)
    }
}

// The cursors of the other members on the board, and the caller's own sent to them. The server tells
// who sent each one and never echoes the caller's own back.
export function useTeamCursors(workspaceId: number | undefined) {
    const memberOf = useMemberDirectory(workspaceId)
    const memberOfRef = useRef(memberOf)
    useEffect(() => {
        memberOfRef.current = memberOf
    })

    const [cursors, setCursors] = useState<TeamCursor[]>([])
    const cursorsRef = useRef<Map<string, TimedCursor>>(new Map())
    const sendRef = useRef<ReturnType<typeof createCursorSender> | null>(null)
    const lastSentRef = useRef(0)

    const flush = useCallback(() => setCursors(Array.from(cursorsRef.current.values())), [])

    useEffect(() => {
        if (workspaceId === undefined) return
        const cursorsMap = cursorsRef.current
        const send = createCursorSender()
        sendRef.current = send

        const drop = (id: string | null | undefined) => {
            if (id && cursorsMap.delete(id)) flush()
        }
        const unsubscribe = subscribeLive({
            onBroadcast: ({ workspaceId: room, event, payload }) => {
                if (room !== workspaceId) return
                if (event === 'cursor-leave') {
                    drop(leavingUserId(payload))
                    return
                }
                if (event !== 'cursor') return
                const cursor = cursorFromPayload(payload, memberOfRef.current)
                if (cursor && placeCursor(cursorsMap, cursor, performance.now())) flush()
            },
        })

        const prune = setInterval(() => {
            const now = performance.now()
            let changed = false
            for (const [id, c] of cursorsMap) {
                if (now - c.ts > STALE_MS) {
                    cursorsMap.delete(id)
                    changed = true
                }
            }
            if (changed) flush()
        }, 1000)

        return () => {
            clearInterval(prune)
            unsubscribe()
            send({ workspaceId, event: 'cursor-leave', payload: {} })
            sendRef.current = null
            cursorsMap.clear()
            setCursors([])
        }
    }, [workspaceId, flush])

    const onPointerWorldMove = useCallback(
        (world: { x: number; y: number } | null) => {
            const send = sendRef.current
            if (!send || workspaceId === undefined || liveStatus() !== 'live') return

            if (!world) {
                send({ workspaceId, event: 'cursor-leave', payload: {} })
                return
            }

            const now = performance.now()
            if (now - lastSentRef.current < THROTTLE_MS) return
            lastSentRef.current = now
            send({ workspaceId, event: 'cursor', payload: { x: world.x, y: world.y } })
        },
        [workspaceId]
    )

    return { cursors, onPointerWorldMove }
}
