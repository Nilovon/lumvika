import { describe, expect, it } from 'vitest'

import { formatSseEvent, readSseEvents, SSE_HEARTBEAT } from './sse'

describe('server-sent event framing', () => {
    it('writes one data line per line of the data', () => {
        expect(formatSseEvent('change', '{"a":1}')).toBe('event: change\ndata: {"a":1}\n\n')
        expect(formatSseEvent('note', 'one\ntwo')).toBe('event: note\ndata: one\ndata: two\n\n')
        expect(formatSseEvent('resync', '')).toBe('event: resync\ndata: \n\n')
    })

    it('reads back what it writes, comments and heartbeats left out', () => {
        const stream = `:live\n\n${formatSseEvent('change', '{"a":1}')}${SSE_HEARTBEAT}${formatSseEvent('resync', '')}${formatSseEvent('note', 'one\ntwo')}`
        expect(readSseEvents(stream)).toEqual({
            events: [
                { event: 'change', data: '{"a":1}' },
                { event: 'resync', data: '' },
                { event: 'note', data: 'one\ntwo' },
            ],
            rest: '',
        })
    })

    it('keeps an event cut in the middle for the next chunk', () => {
        const whole = formatSseEvent('change', '{"table":"agents"}')
        const first = readSseEvents(whole.slice(0, 20))
        expect(first.events).toEqual([])
        const second = readSseEvents(first.rest + whole.slice(20))
        expect(second.events).toEqual([{ event: 'change', data: '{"table":"agents"}' }])
    })

    it('reads CRLF line endings', () => {
        expect(readSseEvents('event: resync\r\ndata:\r\n\r\n').events).toEqual([{ event: 'resync', data: '' }])
    })
})
