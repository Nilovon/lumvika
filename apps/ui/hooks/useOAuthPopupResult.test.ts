import { describe, expect, it } from 'vitest'

import { readOAuthPopupResult } from './useOAuthPopupResult'

type Result = { type: string; key?: string }

const KNOWN = new Set(['composio-oauth-success', 'composio-oauth-error'])

describe('readOAuthPopupResult', () => {
    it('keeps a known result when no filter is given', () => {
        expect(readOAuthPopupResult<Result>({ type: 'composio-oauth-success', key: 'gmail@k3x9ab' }, KNOWN)).toEqual({ type: 'composio-oauth-success', key: 'gmail@k3x9ab' })
    })

    it('drops anything that is not a known result', () => {
        expect(readOAuthPopupResult<Result>(null, KNOWN)).toBeNull()
        expect(readOAuthPopupResult<Result>('composio-oauth-success', KNOWN)).toBeNull()
        expect(readOAuthPopupResult<Result>({ type: 'mcp-oauth-success' }, KNOWN)).toBeNull()
    })

    it('keeps only the result the filter accepts', () => {
        const mine = (data: Result) => data.key === 'gmail@k3x9ab'

        expect(readOAuthPopupResult<Result>({ type: 'composio-oauth-success', key: 'gmail' }, KNOWN, mine)).toBeNull()
        expect(readOAuthPopupResult<Result>({ type: 'composio-oauth-success', key: 'gmail@k3x9ab' }, KNOWN, mine)).toEqual({ type: 'composio-oauth-success', key: 'gmail@k3x9ab' })
    })

    it('runs the filter only on known results', () => {
        let calls = 0
        readOAuthPopupResult<Result>({ type: 'other' }, KNOWN, () => {
            calls++
            return true
        })
        expect(calls).toBe(0)
    })
})
