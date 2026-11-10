import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

// LLM re-rank on top of the vector retrieval. pgvector gives good recall but query-to-
// document cosine similarities are too compressed to gate relevance on their own (a real
// Stripe capability like "refund a customer" scores ~0.21, while unrelated queries like
// "send sms via twilio" score Stripe ~0.26). A hyper-fast model (Gemini Flash Lite via
// OpenRouter) reads the shortlisted candidates and keeps only the ones that genuinely
// provide the capability — or none, which is the signal the agent uses to build it itself.
//
// We ask for a plain JSON array rather than using the AI SDK's Output.object: structured
// output (response_format json_schema) is not supported for Gemini through the
// openai-compatible provider on OpenRouter. Throws on generation failure so the caller can
// fall back to the raw vector ranking rather than silently returning nothing.

const RERANK_MODEL = process.env.LUMVIKA_RERANK_MODEL ?? 'google/gemini-2.5-flash-lite'

function rerankModel() {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return null
    return createOpenAICompatible({ name: 'openrouter', apiKey, baseURL: 'https://openrouter.ai/api/v1' })(RERANK_MODEL)
}

// Pull the first JSON array out of the model's reply (tolerates code fences / stray prose).
function parseSlugs(text: string): string[] {
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) return []
    try {
        const arr: unknown = JSON.parse(match[0])
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
    } catch {
        return []
    }
}

export type RerankCandidate = { slug: string; name: string; summary: string }

export async function rerankRelevant(query: string, candidates: RerankCandidate[]): Promise<string[]> {
    if (candidates.length === 0) return []
    const model = rerankModel()
    if (!model) throw new Error('rerank: no OpenRouter key')

    const list = candidates.map(c => `- ${c.slug}: ${c.name} — ${c.summary}`).join('\n')
    const { text } = await generateText({
        model,
        prompt: `A user is looking for a service that can: "${query}".

Candidate services from the library:
${list}

Which of these services genuinely provide that capability? Be strict: include a service only if it really does what is asked — e.g. a payments service is NOT a match for "send SMS", and a social-media service is NOT a match for "query a database" or "send an email newsletter".

Respond with ONLY a JSON array of the matching slugs, best match first (e.g. ["stripe"]). If none truly fit, respond with []. No prose, no code fences.`,
    })

    const valid = new Set(candidates.map(c => c.slug))
    return parseSlugs(text).filter(s => valid.has(s))
}
