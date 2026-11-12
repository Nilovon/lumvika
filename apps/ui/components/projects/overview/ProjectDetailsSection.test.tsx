// @vitest-environment happy-dom
import type { ProjectDetail } from '@lumvika/contracts'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// A project joins a team and a goal from its own details: the team page and the goal tree read it
// from there.

vi.mock('@/app/api/_actions/projects.actions', () => ({ updateProjectAction: vi.fn() }))
vi.mock('@/app/api/_actions/goals.actions', () => ({
    listGoalsAction: async () => ({
        ok: true,
        teams: [{ id: 'growth', name: 'Growth', color: null }],
        goals: [{ id: 'launch', title: 'Launch v2', children: [{ id: 'site', title: 'New website', children: [] }] }],
        projects: [],
    }),
}))
vi.mock('@/components/issues/AssigneePicker', () => ({ AssigneePicker: () => null }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))

const { ProjectDetailsSection } = await import('./ProjectDetailsSection')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
})

const project = (overrides: Partial<ProjectDetail> = {}) => ({ id: 'p1', status: 'active', lead: null, targetDate: null, teamId: 'growth', goalId: 'site', ...overrides }) as ProjectDetail

async function mount(detail: ProjectDetail, disabled = false) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(createElement(ProjectDetailsSection, { project: detail, disabled, onSaved: () => undefined })))
    for (let i = 0; i < 5; i++) await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
}

describe('ProjectDetailsSection', () => {
    it('shows the team and the goal the project belongs to, by name', async () => {
        await mount(project())
        const team = container!.querySelector('#project-team')
        const goal = container!.querySelector('#project-goal')
        expect(team?.textContent).toBe('Growth')
        expect(goal?.textContent).toBe('New website')
        expect(team?.hasAttribute('disabled')).toBe(false)
        expect(container!.textContent).toContain("The project shows on its team's page.")
    })

    it('says when it has none, and stays read-only for someone who does not manage it', async () => {
        await mount(project({ teamId: null, goalId: null }), true)
        expect(container!.querySelector('#project-team')?.textContent).toBe('No team')
        expect(container!.querySelector('#project-goal')?.textContent).toBe('No goal')
        expect(container!.querySelector('#project-team')?.hasAttribute('disabled')).toBe(true)
    })
})
