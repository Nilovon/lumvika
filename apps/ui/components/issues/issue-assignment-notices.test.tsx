// @vitest-environment happy-dom
import type { IssueDetail, IssueStatus } from '@lumvika/contracts'
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// What a person reads when they hand an issue to a coworker: Backlog wakes nobody until the issue
// moves to Todo, and a server too old to run issues says so without blocking the assignment.

const mocks = vi.hoisted(() => ({ readiness: vi.fn() }))

vi.mock('@/app/api/_actions/issue-runs.actions', () => ({ issueRunsReadinessAction: mocks.readiness }))
vi.mock('@/app/api/_actions/issues.actions', () => ({ listProjectIssuesAction: async () => ({ ok: true, issues: [], totals: {} }) }))
vi.mock('@/components/issues/useWorkMembers', () => ({ useWorkMembers: () => ({ labelOf: () => ({ name: 'Grace' }) }) }))
vi.mock('@/components/issues/AssigneePicker', () => ({
    AssigneePicker: ({ onChange }: { onChange: (value: unknown) => void }) => createElement('button', { type: 'button', 'data-pick-coworker': true, onClick: () => onChange({ kind: 'agent', agentId: 'scout' }) }),
}))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))
vi.mock('@/components/ui/combobox', () => ({ Combobox: () => null }))

const { IssueProperties } = await import('@/components/issues/IssueProperties')
const { NewIssueDialog } = await import('@/components/issues/NewIssueDialog')

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

// The readiness is shared for a minute: each test reads it afresh.
let clock = Date.now()

beforeEach(() => {
    mocks.readiness.mockResolvedValue({ ok: true, readiness: 'ready' })
    clock += 120_000
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
})

afterEach(() => {
    vi.useRealTimers()
    act(() => root?.unmount())
    container?.remove()
    document.body.innerHTML = ''
})

const issue = (status: IssueStatus, assignee: IssueDetail['assignee'] = { kind: 'agent', agentId: 'scout' }) =>
    ({ id: 'i1', projectId: 'p1', ref: 'ENG-1', status, priority: 'none', assignee, dueDate: null, parentIssueId: null, subIssues: [], createdBy: { kind: 'user', userId: 'me' }, createdAt: '2026-11-10T10:00:00Z', projectRestricted: false }) as unknown as IssueDetail

const properties = (detail: IssueDetail, onStatusChange = vi.fn()) => createElement(IssueProperties, { issue: detail, onStatusChange, onPriorityChange: vi.fn(), onAssign: vi.fn(), onUpdate: vi.fn() })

describe('the issue detail of an issue handed to a coworker', () => {
    it('says the coworker starts once the issue leaves the backlog, and moves it to Todo in one click', async () => {
        const onStatusChange = vi.fn()
        await mount(properties(issue('backlog'), onStatusChange))
        expect(document.body.textContent).toContain('The coworker starts once this issue moves to Todo.')
        const move = [...document.querySelectorAll('button')].find(button => button.textContent === 'Move to Todo')!
        await act(async () => move.click())
        expect(onStatusChange).toHaveBeenCalledWith('todo')
    })

    it('says nothing of the backlog once the issue is in Todo, nor for a person', async () => {
        await mount(properties(issue('todo')))
        expect(document.body.textContent).not.toContain('moves to Todo')
        act(() => root?.unmount())
        await mount(properties(issue('backlog', { kind: 'user', userId: 'me' })))
        expect(document.body.textContent).not.toContain('moves to Todo')
    })

    it('says the server must be updated when it cannot run issues, and words a server that does not answer apart', async () => {
        mocks.readiness.mockResolvedValue({ ok: true, readiness: 'outdated' })
        await mount(properties(issue('todo')))
        expect(document.body.textContent).toContain('too old to run coworkers on issues')
    })
})

describe('the new issue dialog', () => {
    const dialog = (status: IssueStatus) => createElement(NewIssueDialog, { projectId: 'p1', projectName: 'Engineering', open: true, onOpenChange: vi.fn(), onCreate: vi.fn(), defaultStatus: status })

    async function pickCoworker() {
        await act(async () => (document.querySelector('[data-pick-coworker]') as HTMLButtonElement).click())
        await settle()
    }

    it('keeps the hint that the coworker picks the issue up for Todo', async () => {
        await mount(dialog('todo'))
        await pickCoworker()
        expect(document.body.textContent).toContain('The coworker is notified and picks the issue up on its own.')
    })

    it('tells the truth for Backlog', async () => {
        await mount(dialog('backlog'))
        await pickCoworker()
        expect(document.body.textContent).toContain('Backlog wakes nobody: the coworker starts once the issue moves to Todo.')
        expect(document.body.textContent).not.toContain('picks the issue up on its own')
    })

    it('words an unreachable server on its own, and lets the issue be created all the same', async () => {
        mocks.readiness.mockResolvedValue({ ok: true, readiness: 'unreachable' })
        await mount(dialog('todo'))
        await pickCoworker()
        expect(document.body.textContent).toContain('does not answer right now')
        const submit = [...document.querySelectorAll('button')].find(button => button.getAttribute('type') === 'submit')
        expect(submit).toBeDefined()
    })
})
