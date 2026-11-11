export type SseEvent = { event: string; data: string }

export function formatSseEvent(event: string, data: string): string {
    return `event: ${event}\n${data.split('\n').map(line => `data: ${line}`).join('\n')}\n\n`
}

export const SSE_HEARTBEAT = ':\n\n'

// The complete events at the start of `buffer`, and what is left of it for the next chunk.
export function readSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
    const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n')
    const rest = blocks.pop() ?? ''
    const events = blocks.flatMap(block => {
        let event = 'message'
        const data: string[] = []
        for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue
            const at = line.indexOf(':')
            const field = at === -1 ? line : line.slice(0, at)
            const value = at === -1 ? '' : line.slice(at + 1).replace(/^ /, '')
            if (field === 'event') event = value
            else if (field === 'data') data.push(value)
        }
        return data.length === 0 ? [] : [{ event, data: data.join('\n') }]
    })
    return { events, rest }
}
