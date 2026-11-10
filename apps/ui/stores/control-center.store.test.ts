import { beforeEach, describe, expect, it } from 'vitest'

import { useControlCenterStore } from './control-center.store'

const INITIAL = useControlCenterStore.getState()

beforeEach(() => {
    useControlCenterStore.setState(INITIAL, true)
})

describe('recent agents', () => {
    it('remembers the agents opened, the latest first and each once', () => {
        const { rememberAgent } = useControlCenterStore.getState()
        rememberAgent('a')
        rememberAgent('b')
        rememberAgent('a')
        expect(useControlCenterStore.getState().recentAgentIds).toEqual(['a', 'b'])
    })

    it('keeps the list for the session when the browser storage is out of reach', () => {
        expect(() => useControlCenterStore.getState().rememberAgent('a')).not.toThrow()
        expect(useControlCenterStore.getState().recentAgentIds).toEqual(['a'])
    })
})
