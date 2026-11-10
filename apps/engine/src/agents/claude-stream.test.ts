import { describe, expect, it } from 'vitest'
import { claudeScreenshotMiddleware, withoutPictures } from './claude-stream.js'

const picture = { type: 'image', data: 'QUJD', mimeType: 'image/jpeg' }
const text = (value: string) => ({ type: 'text', text: value })

const result = (value: unknown, extra: Record<string, unknown> = {}) => ({ type: 'tool-result', toolCallId: 'c1', toolName: 'mcp__lumvika__computer', result: value, ...extra }) as any

describe('withoutPictures', () => {
    it('reads a result that came back with its picture as the JSON the tool returned', () => {
        const part = withoutPictures(result([text('{"status":"done","screenshotId":"s1"}'), picture]))
        expect(part.result).toEqual({ status: 'done', screenshotId: 's1' })
        expect(JSON.stringify(part)).not.toContain('QUJD')
    })

    it('keeps text that is not JSON as text, and joins several blocks', () => {
        expect(withoutPictures(result([text('first'), picture, text('second')])).result).toBe('first\nsecond')
        expect(withoutPictures(result([text('null'), picture])).result).toBe('null')
        expect(withoutPictures(result([picture])).result).toBe('')
    })

    it('clears the picture from the raw copy the provider keeps beside the result', () => {
        const part = withoutPictures(result([text('"ok"'), picture], { providerMetadata: { 'claude-code': { rawResult: '[…QUJD…]', rawResultTruncated: true, parentToolCallId: null }, other: { kept: true } } }))
        expect(part.providerMetadata).toEqual({ 'claude-code': { rawResult: '"ok"', rawResultTruncated: false, parentToolCallId: null }, other: { kept: true } })
    })

    it('leaves everything that carries no picture untouched', () => {
        for (const part of [result({ ok: true }), result('plain'), result([]), result([text('a'), text('b')]), { type: 'text-delta', id: 't', delta: 'hi' } as any]) {
            expect(withoutPictures(part)).toBe(part)
        }
    })
})

describe('claudeScreenshotMiddleware', () => {
    it('strips pictures from a stream as it passes', async () => {
        const parts = [{ type: 'text-delta', id: 't', delta: 'hi' }, result([text('{"screenshotId":"s1"}'), picture])]
        const stream = new ReadableStream({
            start(controller) {
                for (const part of parts) controller.enqueue(part)
                controller.close()
            },
        })
        const wrapped = await claudeScreenshotMiddleware.wrapStream!({ doStream: async () => ({ stream }) } as any)
        const seen: any[] = []
        for await (const part of wrapped.stream as any) seen.push(part)
        expect(seen[0]).toEqual(parts[0])
        expect(seen[1].result).toEqual({ screenshotId: 's1' })
    })

    it('strips pictures from a one-shot answer', async () => {
        const wrapped = await claudeScreenshotMiddleware.wrapGenerate!({ doGenerate: async () => ({ content: [result([text('"ok"'), picture])] }) } as any)
        expect((wrapped.content[0] as any).result).toBe('ok')
    })
})
