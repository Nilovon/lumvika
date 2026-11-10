import { asSchema, type ToolSet } from 'ai'

// What the tools cost the prompt on every step, as the provider serialises them: name, description
// and JSON schema. It is what a step pays before the first message of the conversation.
export function toolPayloadChars(tools: ToolSet): number {
    let total = 0
    for (const [name, t] of Object.entries(tools)) {
        total += JSON.stringify({ name, description: t.description, parameters: asSchema(t.inputSchema).jsonSchema }).length
    }
    return total
}
