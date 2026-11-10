import { generateText } from 'ai'

import { openrouter } from '@/lib/ai/openrouter'

export async function generateSessionTitle(firstMessage: string): Promise<string> {
    const { text } = await generateText({
        model: openrouter('anthropic/claude-haiku-4.5'),
        prompt: `Generate a short, descriptive title (max 6 words) for a conversation that starts with this message. Write the title in the same language as the message. Reply with only the title, no quotes.\n\nMessage: ${firstMessage}`,
    })
    return text.trim().slice(0, 80)
}
