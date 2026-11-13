// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChannelDetail } from '@/app/api/_actions/channels.actions'

// The project and team a channel links to: a manager picks them in the details panel and in the new
// channel dialog, among the projects they see and the teams; anyone else reads the link.

const mocks = vi.hoisted(() => ({
    listProjectsAction: vi.fn(async () => ({
        ok: true,
        projects: [
            { id: 'p1', name: 'Launch', archivedAt: null },
            { id: 'p2', name: 'Old site', archivedAt: '2026-10-01T00:00:00Z' },
        ],
    })),
    listTeamsAction: vi.fn(async () => ({ ok: true, teams: [{ id: 't1', name: 'Growth' }] })),
    createChannelAction: vi.fn(),
}))

vi.mock('@/app/api/_actions/projects.actions', () => ({ listProjectsAction: mocks.listProjectsAction }))
vi.mock('@/app/api/_actions/teams.actions', () => ({ listTeamsAction: mocks.listTeamsAction }))
vi.mock('@/app/api/_actions/channels.actions', () => ({ createChannelAction: mocks.createChannelAction, updateChannelAction: vi.fn() }))
vi.mock('@lumvika/ui/iso-grid', () => ({ AgentBuddy: ({ agentId }: { agentId: string }) => createElement('span', { 'data-buddy': agentId }) }))

const { ChannelDetailsPanel } = await import('@/components/channels/ChannelDetailsPanel')
const { ChannelFormDialog } = await import('@/components/channels/ChannelFormDialog')

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

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
})

function detail(overrides: Partial<ChannelDetail> = {}): ChannelDetail {
    return {
        id: 'c1',
        name: 'launch',
        description: null,
        kind: 'private',
        projectId: 'p1',
        teamId: null,
        createdBy: 'me',
        archivedAt: null,
        createdAt: 'then',
        updatedAt: 'then',
        project: { id: 'p1', key: 'LAU', name: 'Launch' },
        team: null,
        access: 'manage',
        isMember: true,
        members: [],
        coworkers: [],
        ...overrides,
    }
}

const directory = { coworker: () => null, person: () => null, people: null, coworkers: [] } as never
const noop = async () => {}

function panel(overrides: Partial<ChannelDetail> = {}, onLink = vi.fn(noop)) {
    return createElement(ChannelDetailsPanel, { detail: detail(overrides), me: { kind: 'user', userId: 'me' }, directory, authorName: () => 'Someone', onClose: () => {}, onEdit: () => {}, onAddMembers: () => {}, onRemove: noop, onLeave: noop, onArchive: noop, onLink })
}

describe('channel links', () => {
    it('lets a manager pick the project and the team, among the live projects they see', async () => {
        await mount(panel())
        const project = document.getElementById('channel-link-project')
        const team = document.getElementById('channel-link-team')
        expect(project?.textContent).toContain('Launch')
        expect(team?.textContent).toContain('No team')
        expect(mocks.listProjectsAction).toHaveBeenCalledTimes(1)
        expect(mocks.listTeamsAction).toHaveBeenCalledTimes(1)
    })

    it('links the project picked, offering no archived one', async () => {
        const onLink = vi.fn(noop)
        await mount(panel({ projectId: null, project: null }, onLink))
        await act(async () => document.getElementById('channel-link-project')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
        await settle()
        const options = [...document.querySelectorAll('[role="option"]')].map(option => option.textContent)
        expect(options).toEqual(['No project', 'Launch'])
        const launch = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === 'Launch')!
        await act(async () => launch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
        await settle()
        expect(onLink).toHaveBeenCalledWith({ projectId: 'p1' })
    })

    it('shows a member without manage the link to read, with no select and nothing loaded', async () => {
        await mount(panel({ access: 'use' }))
        expect(document.getElementById('channel-link-project')).toBeNull()
        const link = container!.querySelector('a[href="/projects/LAU"]')
        expect(link?.textContent).toContain('Launch')
        expect(mocks.listProjectsAction).not.toHaveBeenCalled()
    })

    it('offers no link on a direct message', async () => {
        await mount(panel({ kind: 'dm', project: null, projectId: null }))
        expect(document.getElementById('channel-link-project')).toBeNull()
        expect(document.getElementById('channel-link-team')).toBeNull()
    })

    it('offers both, optional, when a channel is created', async () => {
        await mount(createElement(ChannelFormDialog, { open: true, onOpenChange: () => {}, onSaved: () => {} }))
        expect(document.getElementById('new-channel-project')?.textContent).toContain('No project')
        expect(document.getElementById('new-channel-team')?.textContent).toContain('No team')
    })
})
