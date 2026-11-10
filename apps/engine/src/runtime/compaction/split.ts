import type { ModelMessage } from 'ai'
import { COMPACTION_CHARS_PER_TOKEN } from './config.js'
import { messageChars } from './estimate.js'

export function tailStartIndex(messages: ModelMessage[], tailTokenBudget: number): number {
    let tokens = 0
    let index = messages.length
    for (let i = messages.length - 1; i >= 0; i--) {
        tokens += Math.ceil(messageChars(messages[i]) / COMPACTION_CHARS_PER_TOKEN)
        if (tokens > tailTokenBudget) break
        index = i
    }
    return index
}
