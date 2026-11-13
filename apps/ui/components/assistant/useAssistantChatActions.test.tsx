// @vitest-environment happy-dom
import type { AssistantChat } from '@lumvika/contracts'
import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ deleteAssistantChatAction: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

vi.mock('@/app/api/_actions/assistant.actions', () => ({ archiveAssistantChatAction: vi.fn(), deleteAssistantChatAction: mocks.deleteAssistantChatAction, updateAssistantChatAction: vi.fn(), loadAssistantHomeAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const { useAssistantChatActions } = await import('./useAssistantChatActions')

const chat = { id: 'chat-1', title: 'Pricing' } as AssistantChat

async function destroy(onGone = vi.fn()) {
    let done: Promise<boolean> | null = null
    function Probe() {
        const { destroy } = useAssistantChatActions(onGone)
        useEffect(() => {
            done = destroy(chat)
        }, [destroy])
        return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(createElement(Probe)))
    const result = await done!
    act(() => root.unmount())
    return { result, onGone }
}

beforeEach(() => vi.clearAllMocks())

describe('deleting a chat', () => {
    it('says the chat is gone when its conversation was erased', async () => {
        mocks.deleteAssistantChatAction.mockResolvedValue({ ok: true, transcript: 'erased' })
        const { result, onGone } = await destroy()
        expect(result).toBe(true)
        expect(mocks.toast.success).toHaveBeenCalledWith('Chat deleted.')
        expect(onGone).toHaveBeenCalledWith('chat-1')
    })

    it('says what stayed on a server too old to erase it', async () => {
        mocks.deleteAssistantChatAction.mockResolvedValue({ ok: true, transcript: 'outdated' })
        await destroy()
        expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('runs an older version of Lumvika'), expect.anything())
        expect(mocks.toast.success).not.toHaveBeenCalled()
    })

    it('says what stayed on a server that did not answer', async () => {
        mocks.deleteAssistantChatAction.mockResolvedValue({ ok: true, transcript: 'unreachable' })
        await destroy()
        expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('did not answer'), expect.anything())
    })

    it('keeps the chat when the deletion was refused', async () => {
        mocks.deleteAssistantChatAction.mockResolvedValue({ ok: false, error: 'Chat not found', code: 'assistantChatNotFound' })
        const { result, onGone } = await destroy()
        expect(result).toBe(false)
        expect(mocks.toast.error).toHaveBeenCalledWith('Chat not found')
        expect(onGone).not.toHaveBeenCalled()
    })
})
