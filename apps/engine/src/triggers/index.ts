import { listTriggers } from './loader.js'

// Neither the token nor the call count is here: this index goes into every system prompt, where the
// token would end up in every transcript and every prompt cache, and the count would move the
// cached prefix on every call. The agent reads both with trigger_get.
export async function buildTriggerIndex(agentId: string): Promise<string> {
    const triggers = (await listTriggers(agentId)).filter(t => t.enabled).sort((a, b) => a.slug.localeCompare(b.slug))
    if (triggers.length === 0) return ''
    const lines = triggers.map(t => `- ${t.name} (slug: ${t.slug}): ${t.methods.join('/')}`)
    return `These webhook triggers start a run when their public URL is called by an external service. Manage them with the trigger_* tools, and use trigger_get to read a trigger's URL, its call count and its last call.\n\n${lines.join('\n')}`
}
