import { beforeEach, describe, expect, it, vi } from 'vitest'

const board = vi.hoisted(() => ({ selectAgent: vi.fn(), selectSpace: vi.fn() }))

vi.mock('@/stores/board.store', () => ({ useBoardStore: { getState: () => board } }))
vi.mock('@/lib/steward-open', () => ({ rememberStewardOpen: vi.fn() }))
vi.mock('@/lib/steward-layout', () => ({ rememberStewardPlacement: vi.fn() }))

import { rememberStewardPlacement } from '@/lib/steward-layout'
import type { StewardPlacement } from '@/lib/steward-layout'
import { rememberStewardOpen } from '@/lib/steward-open'
import { stewardOrbState, selectStewardBackend, selectStewardOpen, selectStewardVisible, useStewardStore } from './steward.store'

const INITIAL = useStewardStore.getState()
const DOCK: StewardPlacement = { mode: 'dock', side: 'right', width: 400, height: 600, dockWidth: 400 }
const FLOAT: StewardPlacement = { mode: 'float', corner: 'top-left', width: 400, height: 600, dockWidth: 400 }

beforeEach(() => {
    vi.clearAllMocks()
    useStewardStore.setState(INITIAL, true)
})

describe('restoreOpen / restorePlacement', () => {
    it('fill the value only while the client has not decided yet', () => {
        const store = useStewardStore.getState()
        store.restoreOpen(false)
        store.restoreOpen(true)
        store.restorePlacement(DOCK)
        store.restorePlacement(FLOAT)
        expect(useStewardStore.getState()).toMatchObject({ open: false, placement: DOCK })
    })

    it('leave a value set by a gesture alone and never remember anything', () => {
        useStewardStore.getState().openForFunnel()
        useStewardStore.getState().setPlacement(FLOAT)
        vi.mocked(rememberStewardPlacement).mockClear()
        useStewardStore.getState().restoreOpen(false)
        useStewardStore.getState().restorePlacement(DOCK)
        expect(useStewardStore.getState()).toMatchObject({ open: true, placement: FLOAT })
        expect(rememberStewardOpen).not.toHaveBeenCalled()
        expect(rememberStewardPlacement).not.toHaveBeenCalled()
    })
})

describe('opening', () => {
    it('toggles from undecided to open, clears the board selection and remembers it', () => {
        useStewardStore.getState().toggle()
        expect(useStewardStore.getState().open).toBe(true)
        expect(board.selectAgent).toHaveBeenCalledWith(null)
        expect(board.selectSpace).toHaveBeenCalledWith(null)
        expect(rememberStewardOpen).toHaveBeenLastCalledWith(true)
        useStewardStore.getState().toggle()
        expect(useStewardStore.getState().open).toBe(false)
        expect(rememberStewardOpen).toHaveBeenLastCalledWith(false)
    })

    it('opens for the funnel without turning it into a preference', () => {
        useStewardStore.getState().openForFunnel()
        expect(useStewardStore.getState().open).toBe(true)
        expect(rememberStewardOpen).not.toHaveBeenCalled()
    })

    it('starts the funnel with its intake card in one go', () => {
        useStewardStore.getState().startFunnel(true)
        expect(useStewardStore.getState()).toMatchObject({ funnel: 'guided', intake: true, open: true })
    })

    it('opens and parks a prompt when asked from outside the column', () => {
        useStewardStore.getState().askSteward('Set up my CRM')
        expect(useStewardStore.getState()).toMatchObject({ open: true, pendingPrompt: 'Set up my CRM' })
        expect(rememberStewardOpen).toHaveBeenCalledWith(true)
    })
})

describe('yielding to a sheet', () => {
    it('steps aside without remembering it, and comes back when the sheet closes', () => {
        useStewardStore.setState({ open: true })
        useStewardStore.getState().yieldToSheet()
        expect(useStewardStore.getState()).toMatchObject({ open: false, yieldedToSheet: true })
        useStewardStore.getState().reclaimFromSheet()
        expect(useStewardStore.getState()).toMatchObject({ open: true, yieldedToSheet: false })
        expect(rememberStewardOpen).not.toHaveBeenCalled()
    })

    it('does not reopen a column that never stepped aside', () => {
        useStewardStore.setState({ open: false })
        useStewardStore.getState().reclaimFromSheet()
        expect(useStewardStore.getState().open).toBe(false)
    })

    it('stays closed once closed by hand while stepped aside', () => {
        useStewardStore.setState({ open: true })
        useStewardStore.getState().yieldToSheet()
        useStewardStore.getState().close()
        useStewardStore.getState().reclaimFromSheet()
        expect(useStewardStore.getState().open).toBe(false)
    })

    it('forgets the step aside when the orb reopens the column', () => {
        useStewardStore.setState({ open: true })
        useStewardStore.getState().yieldToSheet()
        useStewardStore.getState().toggle()
        expect(useStewardStore.getState()).toMatchObject({ open: true, yieldedToSheet: false })
    })
})

describe('on a page too narrow to dock', () => {
    it('opens and closes over the page without touching the column or the preference', () => {
        useStewardStore.setState({ open: true })
        useStewardStore.getState().setSqueezed(true)
        expect(selectStewardOpen(useStewardStore.getState())).toBe(false)

        useStewardStore.getState().toggle()
        expect(selectStewardOpen(useStewardStore.getState())).toBe(true)
        useStewardStore.getState().close()
        expect(selectStewardOpen(useStewardStore.getState())).toBe(false)

        expect(useStewardStore.getState().open).toBe(true)
        expect(rememberStewardOpen).not.toHaveBeenCalled()
    })

    it('opens over the page to take a prompt, and folds back when the page changes or widens', () => {
        useStewardStore.getState().setSqueezed(true)
        useStewardStore.getState().askSteward('hello')
        expect(useStewardStore.getState()).toMatchObject({ overlayOpen: true, pendingPrompt: 'hello' })

        useStewardStore.getState().closeOverlay()
        expect(useStewardStore.getState().overlayOpen).toBe(false)

        useStewardStore.getState().toggle()
        useStewardStore.getState().setSqueezed(false)
        expect(useStewardStore.getState().overlayOpen).toBe(false)
        expect(useStewardStore.getState().open).toBeNull()
    })
})

describe('backend', () => {
    it('talks to the hub through the onboarding and to the engine past it', () => {
        const store = useStewardStore.getState()
        store.setSurface('onboarding')
        expect(selectStewardBackend(useStewardStore.getState())).toBe('hub')
        store.setSurface('engine')
        expect(selectStewardBackend(useStewardStore.getState())).toBe('engine')
    })

    // The onboarding's conversation stays on screen once the build moved the workspace to the
    // engine: it is the next message that opens one there.
    it('keeps a pinned conversation where it started when the surface moves', () => {
        const store = useStewardStore.getState()
        store.setSurface('onboarding')
        store.pinBackend()
        store.setSurface('engine')
        expect(selectStewardBackend(useStewardStore.getState())).toBe('hub')
        store.newChat()
        expect(selectStewardBackend(useStewardStore.getState())).toBe('engine')
    })

    it('hides the steward only once the server said there is no machine', () => {
        expect(selectStewardVisible(useStewardStore.getState())).toBe(true)
        useStewardStore.getState().setSurface('none')
        expect(selectStewardVisible(useStewardStore.getState())).toBe(false)
    })

    it('starts a new chat unpinned, on a fresh session, without the previews', () => {
        const store = useStewardStore.getState()
        const before = useStewardStore.getState().sessionId
        store.pinBackend()
        store.setPlanPreview({} as never)
        store.newChat()
        expect(useStewardStore.getState()).toMatchObject({ backend: null, planPreview: null, intakePreview: null, intake: false })
        expect(useStewardStore.getState().sessionId).not.toBe(before)
    })
})

describe('reset', () => {
    it('forgets the visitor\'s conversation but keeps the screen preferences', () => {
        const store = useStewardStore.getState()
        store.restoreOpen(true)
        store.restorePlacement(DOCK)
        store.startFunnel(true)
        store.askSteward('hi')
        store.reset()
        expect(useStewardStore.getState()).toMatchObject({ open: true, placement: DOCK, funnel: 'unknown', intake: false, pendingPrompt: null, accountSwitches: 1 })
    })
})

describe('selectors', () => {
    it('reads an undecided column as closed', () => {
        expect(selectStewardOpen(useStewardStore.getState())).toBe(false)
    })

    it('lets work in progress win over the open state of the orb', () => {
        expect(stewardOrbState({ open: true, activity: 'idle' })).toBe('listening')
        expect(stewardOrbState({ open: false, activity: 'idle' })).toBe('idle')
        expect(stewardOrbState({ open: false, activity: 'thinking' as never })).toBe('thinking')
    })
})
