import type { UIMessage } from 'ai'

// Two turns streamed at once into the same chat push their answers over each other, A, B, A, B…,
// and the hub persisted that transcript as the browser sent it. Each answer is kept once, where it
// first appeared, with the content of its last copy: the copies are snapshots of one stream, the
// last one the furthest along. A message with no id has nothing to be matched on and is kept.
export function dedupeMessagesById(messages: UIMessage[]): UIMessage[] {
    const lastCopy = new Map<string, UIMessage>()
    for (const message of messages) if (message.id) lastCopy.set(message.id, message)
    if (lastCopy.size === messages.filter(message => message.id).length) return messages

    const placed = new Set<string>()
    const deduped: UIMessage[] = []
    for (const message of messages) {
        if (!message.id) {
            deduped.push(message)
            continue
        }
        if (placed.has(message.id)) continue
        placed.add(message.id)
        deduped.push(lastCopy.get(message.id) ?? message)
    }
    return deduped
}
