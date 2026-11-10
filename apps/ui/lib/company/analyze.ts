import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@rerun/contracts'
import { generateText } from 'ai'
import { z } from 'zod'

import { INDUSTRY_GUIDE } from './industry'

// Reads a scraped home page and tells us who the company is. The one thing the onboarding needs
// from it is `industry`, which decides the connectors put in front of the person and the category
// the template library opens on; the rest is context we keep on the user row for later.
//
// Plain JSON rather than the AI SDK's structured output: the default model is Gemini through the
// openai-compatible provider on OpenRouter, where response_format json_schema is not supported
// (same constraint as lib/services/rerank.ts).

const ANALYSIS_MODEL = process.env.RERUN_COMPANY_MODEL ?? 'google/gemini-2.5-flash-lite'

// The site we read, plus what the model made of it. Lives here rather than beside the server action
// so a client component can name it without importing a 'use server' module for a type.
export type CompanyAnalysis = { url: string; profile: CompanyProfile }

export type CompanyProfile = {
    name: string
    industry: TemplateCategory
    description: string
    offering: string
    audience: string
}

const profileSchema = z.object({
    name: z.string().trim().min(1).max(80),
    industry: z.enum(TEMPLATE_CATEGORIES),
    description: z.string().trim().max(400),
    offering: z.string().trim().max(200),
    audience: z.string().trim().max(200),
})

function analysisModel() {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return null
    return createOpenAICompatible({ name: 'openrouter', apiKey, baseURL: 'https://openrouter.ai/api/v1' })(ANALYSIS_MODEL)
}

function extractJson(text: string): unknown {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
        return JSON.parse(match[0])
    } catch {
        return null
    }
}

export async function analyzeCompany(markdown: string, domain: string): Promise<CompanyProfile | null> {
    const model = analysisModel()
    if (!model) return null

    const prompt = `Here is the home page of the company at ${domain}, as markdown:

"""
${markdown}
"""

Describe the company behind this page.

Fields:
- "name": the commercial name of the company as it presents itself. Not the domain, not a tagline.
- "industry": the single closest match among these. Pick a real one whenever the company plausibly
  belongs to it; "other" is a last resort, not a way to avoid choosing.
${INDUSTRY_GUIDE}
- "description": one or two sentences on what the company is.
- "offering": what it sells, in a few words.
- "audience": who it sells to, in a few words.

Write in English. Respond with ONLY a JSON object, no prose, no code fences:
{ "name": "...", "industry": "...", "description": "...", "offering": "...", "audience": "..." }`

    try {
        const { text } = await generateText({ model, prompt })
        const parsed = profileSchema.safeParse(extractJson(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}
