import type { BoardAgent } from '@lumvika/contracts'
import { act, renderHook } from '@testing-library/react-native'

import type { BoardRead } from '@/api/board'
import type { LiveSubscription } from '@/lib/live'
import { cachedBoard, clearLocalCache } from '@/data/local-cache'

import { useBoard } from './useBoard'

const mockFetchBoard = jest.fn<Promise<BoardRead>, []>()

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }))
jest.mock('@/api/board', () => ({ fetchBoard: () => mockFetchBoard() }))
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 't' }, me: { user: { id: 'u1' }, workspace: { id: 7 } } }) }))

const mockSubscriptions: LiveSubscription[] = []

jest.mock('@/lib/live', () => ({
    subscribeLive: (_token: string, subscriptions: LiveSubscription[]) => {
        mockSubscriptions.push(...subscriptions)
        return () => {}
    },
}))

const agent = (id: string, name: string): BoardAgent => ({ id, name, handle: null, description: null, templateId: null, status: 'idle', workspaceId: 7, spaceId: 's1', disabledAt: null, disabledReason: null })
const boardWith = (...agents: BoardAgent[]): BoardRead => ({ agents, overview: [], boxes: [] })

describe('useBoard', () => {
    beforeEach(() => {
        clearLocalCache()
        mockFetchBoard.mockReset()
        mockSubscriptions.length = 0
    })

    it('listens to the Boxes named to the caller, so one handed over or taken back reaches the home', async () => {
        mockFetchBoard.mockResolvedValue(boardWith())
        await renderHook(() => useBoard())
        await act(async () => {})
        expect(mockSubscriptions).toContainEqual(expect.objectContaining({ table: 'space_members', filter: { user_id: 'u1' } }))
    })

    it('opens on the rows kept from the last visit, then on the hub copy', async () => {
        cachedBoard(7).save(boardWith(agent('a1', 'Scout')))
        let answer: (board: BoardRead) => void = () => {}
        mockFetchBoard.mockReturnValue(new Promise(resolve => (answer = resolve)))

        const { result } = await renderHook(() => useBoard())
        expect(result.current).toMatchObject({ state: 'ready', fresh: false, coworkers: [{ name: 'Scout' }] })

        await act(async () => answer(boardWith(agent('a1', 'Scout'), agent('a2', 'Writer'))))
        expect(result.current).toMatchObject({ state: 'ready', fresh: true })
        expect(result.current.state === 'ready' && result.current.coworkers).toHaveLength(2)
        expect(cachedBoard(7).read()?.agents).toHaveLength(2)
    })

    it('stays on the kept rows when the hub cannot be reached', async () => {
        cachedBoard(7).save(boardWith(agent('a1', 'Scout')))
        mockFetchBoard.mockRejectedValue(new Error('offline'))

        const { result } = await renderHook(() => useBoard())
        await act(async () => {})

        expect(result.current).toMatchObject({ state: 'ready', fresh: false })
    })

    it('falls on the error when nothing was kept', async () => {
        mockFetchBoard.mockRejectedValue(new Error('offline'))

        const { result } = await renderHook(() => useBoard())
        await act(async () => {})

        expect(result.current.state).toBe('error')
    })
})
