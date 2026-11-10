import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from 'ai'
import type { z } from 'zod'
import { raceAbort } from '../lib/abort.js'

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/

function parseJsonLoose(text: string): unknown {
    const unfenced = text.match(FENCE)?.[1] ?? text
    try {
        return JSON.parse(unfenced)
    } catch {
        const start = unfenced.indexOf('{')
        const end = unfenced.lastIndexOf('}')
        if (start === -1 || end <= start) throw new Error('The model returned no JSON object.')
        return JSON.parse(unfenced.slice(start, end + 1))
    }
}

/**
 * A one-shot structured call that reads the JSON from the text the model returned rather than
 * from `result.output`. The AI SDK only fills `output` when the step finished on `stop`, and the
 * Claude Code CLI answers a schema through a tool call, which lands as `tool-calls`: the JSON is
 * complete in `text` and `output` throws. `Output.object` stays on the call because it is what
 * turns on native structured output where the provider has one.
 */
export async function generateStructured<T>(input: { model: LanguageModel; schema: z.ZodType<T>; prompt: string; abortSignal?: AbortSignal }): Promise<T> {
    let text: string
    try {
        const call = generateText({ model: input.model, output: Output.object({ schema: input.schema }), prompt: input.prompt, abortSignal: input.abortSignal })
        const result = await (input.abortSignal ? raceAbort(call, input.abortSignal) : call)
        text = result.text
    } catch (err) {
        // An API provider validates on its own and throws with the raw text attached: a fenced or
        // padded answer that still holds the object is recovered here rather than lost.
        if (NoObjectGeneratedError.isInstance(err) && err.text) {
            const recovered = input.schema.safeParse(tryParse(err.text))
            if (recovered.success) return recovered.data
        }
        throw err
    }
    return input.schema.parse(parseJsonLoose(text))
}

function tryParse(text: string): unknown {
    try {
        return parseJsonLoose(text)
    } catch {
        return undefined
    }
}
