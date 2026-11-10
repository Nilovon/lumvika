import type { LanguageModelMiddleware } from 'ai'

type WrapStream = NonNullable<LanguageModelMiddleware['wrapStream']>
type StreamResult = Awaited<ReturnType<Parameters<WrapStream>[0]['doStream']>>
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never
type WrapGenerate = NonNullable<LanguageModelMiddleware['wrapGenerate']>
type GenerateResult = Awaited<ReturnType<Parameters<WrapGenerate>[0]['doGenerate']>>
type GeneratePart = GenerateResult['content'][number]

type Block = { type?: unknown; text?: unknown }

const isText = (block: Block | null): block is { type: 'text'; text: string } => block?.type === 'text' && typeof block.text === 'string'

// The provider reads a result made of text blocks back into what the tool returned, and leaves one
// that also carries a picture as raw blocks. This finishes the job on the text and drops the rest.
function textOf(result: unknown): string | null {
    if (!Array.isArray(result) || result.length === 0) return null
    const blocks = result as Array<Block | null>
    if (blocks.every(isText)) return null
    return blocks
        .filter(isText)
        .map(block => block.text)
        .join('\n')
}

function parsed(text: string): unknown {
    try {
        return JSON.parse(text) ?? text
    } catch {
        return text
    }
}

// A screenshot goes to the model inside the tool result. The CLI echoes that result into the
// stream, where the picture would be shown, stored and replayed as a wall of base64.
export function withoutPictures<Part extends StreamPart | GeneratePart>(part: Part): Part {
    const item = part as Part & { type: string; result?: unknown; providerMetadata?: Record<string, Record<string, unknown>> }
    if (item.type !== 'tool-result') return part
    const text = textOf(item.result)
    if (text === null) return part
    const metadata = item.providerMetadata?.['claude-code']
    return {
        ...part,
        result: parsed(text),
        ...(metadata ? { providerMetadata: { ...item.providerMetadata, 'claude-code': { ...metadata, rawResult: text, rawResultTruncated: false } } } : {}),
    }
}

export const claudeScreenshotMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',
    async wrapStream({ doStream }) {
        const result = await doStream()
        return {
            ...result,
            stream: result.stream.pipeThrough(
                new TransformStream<StreamPart, StreamPart>({
                    transform(part, controller) {
                        controller.enqueue(withoutPictures(part))
                    },
                }),
            ),
        }
    },
    async wrapGenerate({ doGenerate }) {
        const result = await doGenerate()
        return { ...result, content: result.content.map(withoutPictures) }
    },
}
