import { beforeEach, describe, expect, it } from 'vitest'
import { APICallError } from 'ai'
import { armBudgetLatch, clearBudgetLatch, isBudgetLatched, isRerunBudgetError } from './budget-latch.js'

const budgetError = (statusCode: number, responseBody: string) =>
    new APICallError({ message: 'Payment Required', url: 'https://hub.test/api/llm/chat/completions', requestBodyValues: {}, statusCode, responseBody })

describe('budget latch', () => {
    beforeEach(() => clearBudgetLatch())

    it('is unlatched by default', () => {
        expect(isBudgetLatched()).toBe(false)
    })

    it('arms for ten minutes then expires', () => {
        const now = 1_000_000
        armBudgetLatch(now)
        expect(isBudgetLatched(now)).toBe(true)
        expect(isBudgetLatched(now + 10 * 60_000 - 1)).toBe(true)
        expect(isBudgetLatched(now + 10 * 60_000)).toBe(false)
    })

    it('clears on demand', () => {
        armBudgetLatch()
        clearBudgetLatch()
        expect(isBudgetLatched()).toBe(false)
    })
})

describe('isRerunBudgetError', () => {
    it('matches a 402 API call error', () => {
        expect(isRerunBudgetError(budgetError(402, '{"error":"rerun_budget_exhausted"}'))).toBe(true)
    })

    it('matches the sentinel in the response body regardless of status', () => {
        expect(isRerunBudgetError(budgetError(400, '{"error":"rerun_budget_exhausted"}'))).toBe(true)
    })

    it('matches the sentinel in a stringified error', () => {
        expect(isRerunBudgetError(new Error('AI_APICallError: rerun_budget_exhausted'))).toBe(true)
    })

    it('ignores other API errors', () => {
        expect(isRerunBudgetError(budgetError(500, '{"error":"upstream down"}'))).toBe(false)
        expect(isRerunBudgetError(new Error('boom'))).toBe(false)
    })
})
