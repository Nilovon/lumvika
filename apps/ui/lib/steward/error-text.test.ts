import { APICallError, RetryError } from 'ai'
import { describe, expect, it } from 'vitest'

import { classifyChatError } from '@/lib/chat-error'

import { stewardErrorText } from './error-text'

const apiError = (statusCode: number) => new APICallError({ message: `Provider said ${statusCode}`, url: 'https://openrouter.ai/api/v1/chat/completions', requestBodyValues: {}, statusCode })

describe('stewardErrorText', () => {
    it('reads a rate limit as an overloaded provider', () => {
        expect(classifyChatError(stewardErrorText(apiError(429)))).toBe('overloaded')
    })

    it('reads a server failure as an overloaded provider', () => {
        expect(classifyChatError(stewardErrorText(apiError(503)))).toBe('overloaded')
        expect(classifyChatError(stewardErrorText(apiError(529)))).toBe('overloaded')
    })

    // The steward runs on Lumvika's key: a spent or refused key is neither the user's budget nor their connection.
    it('shows a refused Lumvika key as neither the budget wall nor a signed-out connection', () => {
        expect(classifyChatError(stewardErrorText(apiError(402)))).toBe('generic')
        expect(classifyChatError(stewardErrorText(apiError(401)))).toBe('generic')
        expect(stewardErrorText(apiError(402))).not.toContain('402')
    })

    it('reads the last attempt of a retried call', () => {
        const retried = new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [apiError(503), apiError(503)] })

        expect(classifyChatError(stewardErrorText(retried))).toBe('overloaded')
    })

    it('keeps the text a tool wrote for the model', () => {
        const message = 'A plan needs its one item: the coworker for the job they picked, with its name and its role.'

        expect(stewardErrorText(new Error(message))).toBe(message)
    })

    it('keeps a thrown value that is not an Error', () => {
        expect(stewardErrorText('No Box with id 4 in this workspace.')).toBe('No Box with id 4 in this workspace.')
    })
})
