import { describe, expect, it } from 'vitest'
import { MCP_FIELD_CHAR_LIMIT, MCP_RESPONSE_CHAR_LIMIT, responseTooLarge, tooLargeMessage, truncateField } from './truncate'

describe('truncateField', () => {
    it('leaves a value that fits untouched', () => {
        expect(truncateField('short')).toBe('short')
    })

    it('passes null through, so an absent field stays absent', () => {
        expect(truncateField(null)).toBeNull()
    })

    it('keeps the head and says how much it cut', () => {
        const out = truncateField('x'.repeat(MCP_FIELD_CHAR_LIMIT + 500))
        expect(out).toContain('[truncated]')
        expect(out).toContain('500 more chars')
        expect(out?.startsWith('x'.repeat(MCP_FIELD_CHAR_LIMIT))).toBe(true)
    })

    it('bounds the 1 MB tool result that broke a real session', () => {
        const out = truncateField('y'.repeat(1_036_943))
        expect(out!.length).toBeLessThan(MCP_FIELD_CHAR_LIMIT + 100)
    })
})

describe('responseTooLarge', () => {
    it('accepts an ordinary response', () => {
        expect(responseTooLarge(JSON.stringify({ runs: [] }))).toBe(false)
    })

    it('refuses one past the ceiling', () => {
        expect(responseTooLarge('z'.repeat(MCP_RESPONSE_CHAR_LIMIT + 1))).toBe(true)
    })

    it('tells the model what to do instead of retrying', () => {
        const message = tooLargeMessage('get_run', MCP_RESPONSE_CHAR_LIMIT + 1)
        expect(message).toContain('get_run')
        expect(message).toContain('includeToolCalls')
    })
})
