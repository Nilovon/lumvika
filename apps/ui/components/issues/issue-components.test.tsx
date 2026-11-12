// @vitest-environment happy-dom
import type { IssueSummary, WorkMemberRef } from '@lumvika/contracts'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The shared pieces of the work screens: a status menu that only offers what the workflow allows, a
// row that opens its issue, and an assignee picker over the people and the coworkers of a workspace.

const mocks = vi.hoisted(() => ({
    people: [
        { id: 'me', name: 'Grace Hopper', avatarUrl: null, role: 'admin' },
        { id: 'ada', name: 'Ada Lovelace', avatarUrl: null, role: 'member' },
    ],
    agents: [
        { id: 'scout', name: 'Scout', disabledAt: null },
        { id: 'off', name: 'Retired', disabledAt: '2026-11-01T00:00:00Z' },
    ],
}))

vi.mock('@/app/api/_actions/members.actions', () => ({ listMemberProfilesAction: async () => mocks.people }))
vi.mock('@/stores/board.store', () => ({ useBoardStore: (select: (state: { agents: typeof mocks.agents }) => unknown) => select({ agents: mocks.agents }) }))
vi.mock('@/supabase/session/SessionProvider', () => ({ useSession: () => ({ workspace: { id: 1 }, user: { id: 'me' } }) }))
vi.mock('@lumvika/ui/iso-grid', () => ({ AgentBuddy: ({ agentId }: { agentId: string }) => createElement('span', { 'data-buddy': agentId }) }))

const { IssueStatusPicker } = await import('@/components/issues/IssueStatusPicker')
const { IssueRow } = await import('@/components/issues/IssueRow')
const { AssigneePicker } = await import('@/components/issues/AssigneePicker')
const { IssuePriorityIndicator } = await import('@/components/issues/IssuePriorityIndicator')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function settle() {
    for (let i = 0; i < 5; i++) await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

async function mount(element: ReactElement) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(element))
    await settle()
}

async function press(trigger: Element) {
    await act(async () => {
        trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
        ;(trigger as HTMLElement).click()
    })
    await settle()
}

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    document.body.innerHTML = ''
})

function issue(overrides: Partial<IssueSummary> = {}): IssueSummary {
    return {
        id: 'i1',
        projectId: 'p1',
        number: 12,
        ref: 'ENG-12',
        title: 'Ship the board',
        status: 'todo',
        priority: 'high',
        assignee: null,
        parentIssueId: null,
        goalId: null,
        dueDate: null,
        position: 1024,
        checkoutRunId: null,
        checkedOutAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
        ...overrides,
    }
}

const menuLabels = () => [...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)

describe('IssueStatusPicker', () => {
    it('offers only the moves the workflow allows from the current status', async () => {
        await mount(createElement(IssueStatusPicker, { status: 'backlog', onChange: vi.fn() }))
        await press(container!.querySelector('button')!)

        expect(menuLabels()).toEqual(['Todo', 'Cancelled'])
    })

    it('hands the picked status back', async () => {
        const onChange = vi.fn()
        await mount(createElement(IssueStatusPicker, { status: 'in_progress', onChange }))
        await press(container!.querySelector('button')!)
        expect(menuLabels()).toEqual(['Todo', 'In review', 'Blocked', 'Done', 'Cancelled'])

        const done = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === 'Done')!
        await act(async () => done.click())

        expect(onChange).toHaveBeenCalledWith('done')
    })

    it('names the current status for a screen reader', async () => {
        await mount(createElement(IssueStatusPicker, { status: 'blocked', onChange: vi.fn() }))
        expect(container!.querySelector('button')!.getAttribute('aria-label')).toBe('Status: Blocked. Change status')
    })
})

describe('IssueRow', () => {
    it('opens its issue on a click and on Enter', async () => {
        const onOpen = vi.fn()
        const shown = issue({ assignee: { kind: 'agent', agentId: 'scout' }, checkoutRunId: 'run-1' })
        await mount(createElement(IssueRow, { issue: shown, onOpen }))
        const row = container!.querySelector<HTMLElement>('[role="button"]')!

        expect(row.getAttribute('aria-label')).toBe('ENG-12 Ship the board')
        await act(async () => row.click())
        await act(async () => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))

        expect(onOpen).toHaveBeenCalledTimes(2)
        expect(onOpen).toHaveBeenCalledWith(shown)
        expect(container!.querySelector('[data-buddy="scout"]')).not.toBeNull()
    })

    it('is not a button without an action', async () => {
        await mount(createElement(IssueRow, { issue: issue() }))
        expect(container!.querySelector('[role="button"]')).toBeNull()
        expect(container!.textContent).toContain('Ship the board')
    })
})

describe('IssuePriorityIndicator', () => {
    it('names the priority', async () => {
        await mount(createElement(IssuePriorityIndicator, { priority: 'urgent' }))
        expect(container!.textContent).toContain('Priority: Urgent')
    })
})

describe('AssigneePicker', () => {
    const optionNames = () => [...document.querySelectorAll('[role="option"]')].map(option => option.querySelector('.flex-1')?.textContent)

    it('lists nobody, the people with the caller first, then the coworkers still switched on', async () => {
        await mount(createElement(AssigneePicker, { value: null, onChange: vi.fn() }))
        await press(container!.querySelector('button')!)

        expect(optionNames()).toEqual(['Unassigned', 'Grace Hopper (you)', 'Ada Lovelace', 'Scout'])
    })

    it('hands back a coworker and a person as work member refs', async () => {
        const onChange = vi.fn<(next: WorkMemberRef | null) => void>()
        await mount(createElement(AssigneePicker, { value: { kind: 'user', userId: 'ada' }, onChange }))
        expect(container!.querySelector('button')!.getAttribute('aria-label')).toBe('Assignee: Ada Lovelace')

        await press(container!.querySelector('button')!)
        const scout = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes('Scout'))!
        await act(async () => scout.click())

        expect(onChange).toHaveBeenCalledWith({ kind: 'agent', agentId: 'scout' })
    })

    it('does not call back when the current assignee is picked again', async () => {
        const onChange = vi.fn()
        await mount(createElement(AssigneePicker, { value: { kind: 'user', userId: 'ada' }, onChange }))
        await press(container!.querySelector('button')!)
        const ada = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes('Ada'))!
        await act(async () => ada.click())

        expect(onChange).not.toHaveBeenCalled()
    })
})
