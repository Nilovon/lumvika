import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { estimateTokens, messageChars } from './estimate.js'
import { tailStartIndex } from './split.js'
import { pruneToolOutputs } from './prune.js'
import { repairToolPairs } from './repair.js'

const msg = (role: string, content: unknown) => ({ role, content }) as ModelMessage
const userText = (text: string) => msg('user', text)
const call = (id: string, name = 'shell_exec') => ({ type: 'tool-call', toolCallId: id, toolName: name, input: {} })
const result = (id: string, output: unknown, name = 'shell_exec') => ({ type: 'tool-result', toolCallId: id, toolName: name, output })
const toolMessage = (...parts: unknown[]) => msg('tool', parts)

type PrunedPart = { type: string; toolCallId: string; toolName: string; output: { type: string; value: unknown } }
const partsOf = (message: ModelMessage) => message.content as unknown as PrunedPart[]

describe('messageChars', () => {
    it('counts string parts and text parts by their text', () => {
        expect(messageChars(msg('user', ['abc', { type: 'text', text: 'de' }]))).toBe(5)
    })

    it('counts a tool call by its input, falling back to legacy args', () => {
        expect(messageChars(msg('assistant', [{ type: 'tool-call', input: { a: 1 } }]))).toBe(JSON.stringify({ a: 1 }).length)
        expect(messageChars(msg('assistant', [{ type: 'tool-call', args: { bb: 2 } }]))).toBe(JSON.stringify({ bb: 2 }).length)
        expect(messageChars(msg('assistant', [{ type: 'tool-call' }]))).toBe(2)
    })

    it('counts a tool result by its output, falling back to legacy result', () => {
        expect(messageChars(msg('tool', [{ type: 'tool-result', output: { type: 'text', value: 'x' } }]))).toBe(JSON.stringify({ type: 'text', value: 'x' }).length)
        expect(messageChars(msg('tool', [{ type: 'tool-result', result: 'yy' }]))).toBe(4)
        expect(messageChars(msg('tool', [{ type: 'tool-result' }]))).toBe(2)
    })

    it('counts an unknown part by its input, its output or the whole part', () => {
        expect(messageChars(msg('assistant', [{ type: 'custom', input: 'abc' }]))).toBe(5)
        expect(messageChars(msg('assistant', [{ type: 'custom', output: 'abcd' }]))).toBe(6)
        const image = { type: 'image', image: 'data' }
        expect(messageChars(msg('user', [image]))).toBe(JSON.stringify(image).length)
    })

    it('counts nothing for empty parts or content of an unexpected shape', () => {
        expect(messageChars(msg('user', [null, undefined, 0]))).toBe(0)
        expect(messageChars(msg('user', undefined))).toBe(0)
        expect(messageChars(msg('user', { text: 'not an array' }))).toBe(0)
    })
})

describe('estimateTokens', () => {
    it('rounds up to whole tokens', () => {
        expect(estimateTokens([userText('abcde')])).toBe(2)
        expect(estimateTokens([userText('abcd')])).toBe(1)
        expect(estimateTokens([])).toBe(0)
    })

    it('adds the system prompt to the messages', () => {
        expect(estimateTokens([userText('abcd')], 'efgh')).toBe(2)
    })
})

describe('tailStartIndex', () => {
    it('includes a message that lands exactly on the budget', () => {
        expect(tailStartIndex([userText('x'.repeat(400))], 100)).toBe(0)
    })

    it('keeps nothing when even the last message overflows', () => {
        expect(tailStartIndex([userText('a'), userText('x'.repeat(400))], 99)).toBe(2)
    })

    it('stops at the first overflow even if older messages would fit', () => {
        const messages = [userText('tiny'), userText('x'.repeat(4000)), userText('recent')]
        expect(tailStartIndex(messages, 100)).toBe(2)
    })

    it('returns 0 for an empty history', () => {
        expect(tailStartIndex([], 10)).toBe(0)
    })
})

describe('pruneToolOutputs', () => {
    it('prunes a text output only above 2000 characters', () => {
        const messages = [toolMessage(result('a', { type: 'text', value: 'x'.repeat(2000) })), toolMessage(result('b', { type: 'text', value: 'x'.repeat(2001) }))]

        const { messages: out, prunedCount, prunedChars } = pruneToolOutputs(messages, 2)

        expect(out[0]).toBe(messages[0])
        expect(partsOf(out[1])[0].output.value).toBe('[pruned] shell_exec output (~2001 chars) elided to save context')
        expect(prunedCount).toBe(1)
        expect(prunedChars).toBe(2001)
    })

    it('measures a json output by its serialized size', () => {
        const atLimit = toolMessage(result('a', { type: 'json', value: 'x'.repeat(1998) }))
        const overLimit = toolMessage(result('b', { type: 'json', value: 'y'.repeat(1999) }))

        const { prunedCount, prunedChars } = pruneToolOutputs([atLimit, overLimit], 2)

        expect(prunedCount).toBe(1)
        expect(prunedChars).toBe(2001)
    })

    it('prunes content outputs', () => {
        const big = toolMessage(result('a', { type: 'content', value: [{ type: 'text', text: 'z'.repeat(3000) }] }))
        expect(pruneToolOutputs([big], 1).prunedCount).toBe(1)
    })

    it('never prunes an error output, however large', () => {
        const messages = [toolMessage(result('a', { type: 'error-text', value: 'e'.repeat(5000) })), toolMessage(result('b', { type: 'error-json', value: { trace: 'e'.repeat(5000) } }))]

        const { messages: out, prunedCount } = pruneToolOutputs(messages, 2)

        expect(prunedCount).toBe(0)
        expect(out).toEqual(messages)
    })

    it('ignores a text output whose value is not a string', () => {
        expect(pruneToolOutputs([toolMessage(result('a', { type: 'text', value: { big: 'x'.repeat(5000) } }))], 1).prunedCount).toBe(0)
    })

    it('marks a repeat of an identical output as a duplicate', () => {
        const big = { type: 'text', value: 'same'.repeat(1000) }
        const messages = [toolMessage(result('a', big)), toolMessage(result('b', big)), toolMessage(result('c', big, 'web_fetch'))]

        const { messages: out, prunedCount, prunedChars } = pruneToolOutputs(messages, 3)

        expect(partsOf(out[0])[0].output.value).toContain('elided to save context')
        expect(partsOf(out[1])[0].output.value).toBe('[pruned] shell_exec output (~4000 chars) — duplicate of an earlier identical result')
        expect(partsOf(out[2])[0].output.value).toContain('web_fetch output (~4000 chars) elided')
        expect(prunedCount).toBe(3)
        expect(prunedChars).toBe(12000)
    })

    it('does not call two outputs of the same size duplicates when they differ early', () => {
        const messages = [toolMessage(result('a', { type: 'text', value: 'a'.repeat(3000) })), toolMessage(result('b', { type: 'text', value: 'b'.repeat(3000) }))]

        const { messages: out } = pruneToolOutputs(messages, 2)

        expect(partsOf(out[1])[0].output.value).toContain('elided to save context')
    })

    it('keeps the other parts of the message and the pairing of the pruned one', () => {
        const messages = [toolMessage(result('small', { type: 'text', value: 'ok' }), { ...result('big', { type: 'text', value: 'x'.repeat(3000) }), providerOptions: { a: 1 } })]

        const parts = partsOf(pruneToolOutputs(messages, 1).messages[0])

        expect(parts[0]).toEqual(result('small', { type: 'text', value: 'ok' }))
        expect(parts[1]).toEqual({ type: 'tool-result', toolCallId: 'big', toolName: 'shell_exec', output: { type: 'text', value: expect.stringContaining('[pruned]') } })
    })

    it('leaves string content alone', () => {
        const messages = [userText('x'.repeat(5000))]
        expect(pruneToolOutputs(messages, 1).messages[0]).toBe(messages[0])
    })
})

describe('repairToolPairs', () => {
    it('answers every dangling call of a message in one stub tool message', () => {
        const out = repairToolPairs([msg('assistant', [{ type: 'text', text: 'checking' }, call('a'), call('b', 'web_fetch')]), userText('next')])

        expect(out).toHaveLength(3)
        expect(out[1]).toEqual({
            role: 'tool',
            content: [
                { type: 'tool-result', toolCallId: 'a', toolName: 'shell_exec', output: { type: 'text', value: '[tool result unavailable: omitted during context compaction]' } },
                { type: 'tool-result', toolCallId: 'b', toolName: 'web_fetch', output: { type: 'text', value: '[tool result unavailable: omitted during context compaction]' } },
            ],
        })
    })

    it('stubs only the calls that have no result', () => {
        const out = repairToolPairs([msg('assistant', [call('a'), call('b')]), toolMessage(result('a', { type: 'text', value: 'ok' }))])

        expect(out).toHaveLength(3)
        expect(partsOf(out[1]).map(p => p.toolCallId)).toEqual(['b'])
        expect(partsOf(out[2]).map(p => p.toolCallId)).toEqual(['a'])
    })

    it('drops the orphan results of a tool message and keeps the paired ones', () => {
        const out = repairToolPairs([msg('assistant', [call('a')]), toolMessage(result('a', { type: 'text', value: 'ok' }), result('ghost', { type: 'text', value: 'lost' }))])

        expect(out).toHaveLength(2)
        expect(partsOf(out[1]).map(p => p.toolCallId)).toEqual(['a'])
    })

    it('keeps a non-tool message even once its orphan results are removed', () => {
        const out = repairToolPairs([msg('assistant', [result('ghost', { type: 'text', value: 'x' })])])

        expect(out).toEqual([{ role: 'assistant', content: [] }])
    })

    it('passes plain text messages through untouched', () => {
        const messages = [userText('a'), msg('assistant', 'b')]
        const out = repairToolPairs(messages)
        expect(out[0]).toBe(messages[0])
        expect(out[1]).toBe(messages[1])
    })
})
