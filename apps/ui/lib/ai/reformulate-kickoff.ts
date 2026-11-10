import { generateText } from 'ai'

import { openrouter } from '@/lib/ai/openrouter'

export async function reformulateKickoff(useCase: string): Promise<string> {
    const { text } = await generateText({
        model: openrouter('anthropic/claude-haiku-4.5'),
        prompt: `Rewrite the following use case as a short first-person message from a user to their newly created AI coworker, kicking off the work. Keep it natural and concise (1 to 2 sentences), in the same language as the input, and ask the coworker to get itself set up for this. Reply with only the message, no quotes.\n\nUse case: ${useCase}`,
    })
    return text.trim()
}
