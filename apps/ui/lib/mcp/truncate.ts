// Size limits for what the MCP servers hand back to a calling model. A tool result lands
// verbatim in that model's transcript and stays there for the rest of the conversation, so an
// unbounded one is not a big answer: it is a conversation that can never be continued. An agent
// reading its own runs through get_run has already produced a single 1 MB tool result this way,
// which pushed its session past what the model could accept and left it unable to reply at all.
//
// Two layers, because they fail differently. Per-field truncation keeps the answer useful: the
// model still sees the head of every tool call and is told what was cut. The response ceiling is
// a backstop for the shapes nobody anticipated, and it refuses rather than truncates, because
// blindly cutting a serialized payload yields invalid JSON.

export const MCP_FIELD_CHAR_LIMIT = 2_000

export const MCP_RESPONSE_CHAR_LIMIT = 200_000

// Mirrors the wording of the engine's own context pruning (runtime/compaction/prune.ts), so a
// model meeting both in one transcript reads the same marker for the same thing.
export function truncateField(value: string | null, limit: number = MCP_FIELD_CHAR_LIMIT): string | null {
    if (value === null || value.length <= limit) return value
    return `${value.slice(0, limit)}… [truncated] ${value.length - limit} more chars elided to save context`
}

export function responseTooLarge(serialized: string, limit: number = MCP_RESPONSE_CHAR_LIMIT): boolean {
    return serialized.length > limit
}

export function tooLargeMessage(name: string, size: number, limit: number = MCP_RESPONSE_CHAR_LIMIT): string {
    return `${name} produced ${size} characters, over the ${limit} limit for one tool result. Narrow the request (fewer rows, a single item, or drop includeToolCalls) rather than retrying as is.`
}
