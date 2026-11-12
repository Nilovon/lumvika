// @vitest-environment happy-dom
import type { AssistantChat } from '@lumvika/contracts'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AssistantHome } from '@/app/api/_actions/assistant.actions'

vi.mock('@/app/api/_actions/assistant.actions', () => ({ archiveAssistantChatAction: vi.fn(), deleteAssistantChatAction: vi.fn(), updateAssistantChatAction: vi.fn(), loadAssistantHomeAction: vi.fn() }))
vi.mock('@/stores/workspace-settings.store', () => ({ useWorkspaceSettingsStore: (select: (state: { openAiProviders: () => void }) => unknown) => select({ openAiProviders: mocks.openAiProviders }) }))

const mocks = vi.hoisted(() => ({ openAiProviders: vi.fn() }))

const { AssistantChatList } = await import('./AssistantChatList')
const { AssistantStateNotice } = await import('./AssistantStateNotice')

let root: Root | null = null
let container: HTMLElement | null = null

function render(element: ReturnType<typeof createElement>) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(element))
    return container
}

afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
})

const today = new Date().toISOString()

function chat(id: string, overrides: Partial<AssistantChat> = {}): AssistantChat {
    return { id, userId: 'me', projectId: null, title: id, engineSessionId: null, model: null, shared: false, lastMessageAt: today, archivedAt: null, createdAt: today, updatedAt: today, ...overrides }
}

function home(overrides: Partial<AssistantHome> = {}): AssistantHome {
    return { mine: [], shared: [], archived: [], availability: 'ready', owners: {}, projects: [], isAdmin: false, ...overrides }
}

const text = () => container!.textContent ?? ''
const type = (input: HTMLInputElement, value: string) => {
    act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('AssistantChatList', () => {
    it('shows a skeleton until the list arrives', () => {
        render(createElement(AssistantChatList, { home: null, activeChatId: null, onOpen: vi.fn(), onNew: vi.fn(), onGone: vi.fn() }))
        expect(container!.querySelector('[aria-hidden]')).not.toBeNull()
        expect(text()).not.toContain('No chats yet')
    })

    it("groups the caller's chats by day, apart from the ones shared with them, who keep their owner's name", () => {
        const onOpen = vi.fn()
        render(createElement(AssistantChatList, { home: home({ mine: [chat('Pricing ideas', { shared: true })], shared: [chat('Hiring plan', { userId: 'ada' })], owners: { ada: 'Ada' } }), activeChatId: 'Pricing ideas', onOpen, onNew: vi.fn(), onGone: vi.fn() }))
        expect(text()).toContain('Today')
        expect(text()).toContain('Pricing ideas')
        expect(text()).toContain('Shared with me')
        expect(text()).toContain('Shared by Ada')
        expect(container!.querySelector('[aria-current="page"]')?.textContent).toContain('Pricing ideas')
        // The owner's menu is on their own chat only.
        expect(container!.querySelectorAll('button[aria-label="Chat options"]')).toHaveLength(1)
        act(() => [...container!.querySelectorAll('button')].find(button => button.textContent?.includes('Hiring plan'))!.click())
        expect(onOpen).toHaveBeenCalledWith('Hiring plan')
    })

    it('searches the titles and says when nothing matches', () => {
        render(createElement(AssistantChatList, { home: home({ mine: [chat('Pricing ideas'), chat('Launch email')] }), activeChatId: null, onOpen: vi.fn(), onNew: vi.fn(), onGone: vi.fn() }))
        const search = container!.querySelector('input[type="search"]') as HTMLInputElement
        type(search, 'launch')
        expect(text()).toContain('Launch email')
        expect(text()).not.toContain('Pricing ideas')
        type(search, 'zzz')
        expect(text()).toContain('No chat matches “zzz”.')
    })

    it('keeps the archived chats folded away until asked', () => {
        render(createElement(AssistantChatList, { home: home({ archived: [chat('Old notes', { archivedAt: today })] }), activeChatId: null, onOpen: vi.fn(), onNew: vi.fn(), onGone: vi.fn() }))
        expect(text()).toContain('No chats yet')
        expect(text()).not.toContain('Old notes')
        act(() => [...container!.querySelectorAll('button')].find(button => button.textContent === 'Show archived (1)')!.click())
        expect(text()).toContain('Old notes')
    })
})

describe('AssistantStateNotice', () => {
    it('asks for a server update on an engine that predates the assistant', () => {
        render(createElement(AssistantStateNotice, { blocker: 'outdated', onRetry: vi.fn() }))
        expect(text()).toContain('Update your server to use Chat')
    })

    it('retries an unreachable server and opens the providers when there is no model', () => {
        const onRetry = vi.fn()
        render(createElement(AssistantStateNotice, { blocker: 'unreachable', onRetry }))
        act(() => container!.querySelector('button')!.click())
        expect(onRetry).toHaveBeenCalled()
        act(() => root?.unmount())
        container?.remove()

        render(createElement(AssistantStateNotice, { blocker: 'no_provider', onRetry }))
        act(() => container!.querySelector('button')!.click())
        expect(mocks.openAiProviders).toHaveBeenCalled()
    })
})
