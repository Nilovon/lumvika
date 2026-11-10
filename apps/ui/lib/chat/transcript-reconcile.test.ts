import { describe, expect, it } from 'vitest'
import { hasDuplicateToolParts, historyCovers, needsReconcile } from '@/lib/chat/transcript-reconcile'

const user = { role: 'user', parts: [{ type: 'text' }] }
const assistant = { role: 'assistant', parts: [{ type: 'text' }] }

describe('historyCovers', () => {
    it('waits while the engine has not written the answer of the last turn yet', () => {
        expect(historyCovers([user, assistant], [user])).toBe(false)
    })

    it('waits while the last persisted row is still the user turn', () => {
        expect(historyCovers([user, assistant], [user, user])).toBe(false)
    })

    it('covers once the assistant row landed, even split over several rows', () => {
        expect(historyCovers([user, assistant], [user, assistant])).toBe(true)
        expect(historyCovers([user, assistant], [user, assistant, assistant])).toBe(true)
    })

    it('covers a live transcript that ends on the user turn as soon as that turn is persisted', () => {
        expect(historyCovers([user], [user])).toBe(true)
        expect(historyCovers([user], [])).toBe(false)
        expect(historyCovers([user, assistant, user], [user, assistant])).toBe(false)
    })

    it('is not fooled by the extra message a replay pushes on top of the persisted answer', () => {
        expect(historyCovers([user, assistant, assistant], [user, assistant])).toBe(true)
    })
})

describe('hasDuplicateToolParts', () => {
    const staticDone = { type: 'tool-db_query', toolCallId: 'c1', state: 'output-available' }
    const dynamicStuck = { type: 'dynamic-tool', toolCallId: 'c1', state: 'input-available' }

    it('flags a call held both as the persisted static part and as a replayed dynamic one', () => {
        expect(hasDuplicateToolParts({ role: 'assistant', parts: [staticDone, dynamicStuck] })).toBe(true)
    })

    it('ignores a message whose parts are all of one shape', () => {
        expect(hasDuplicateToolParts({ role: 'assistant', parts: [staticDone, { ...staticDone, toolCallId: 'c2' }] })).toBe(false)
        expect(hasDuplicateToolParts({ role: 'assistant', parts: [dynamicStuck, { ...dynamicStuck, toolCallId: 'c2' }] })).toBe(false)
    })

    it('ignores different calls that merely mix shapes', () => {
        expect(hasDuplicateToolParts({ role: 'assistant', parts: [staticDone, { ...dynamicStuck, toolCallId: 'c2' }] })).toBe(false)
    })
})

describe('needsReconcile', () => {
    const done = { type: 'dynamic-tool', toolCallId: 'c1', state: 'output-available' }

    it('asks for the transcript when nothing streamed after the user turn', () => {
        expect(needsReconcile([user])).toBe(true)
        expect(needsReconcile([])).toBe(true)
    })

    it('leaves a settled answer alone', () => {
        expect(needsReconcile([user, { role: 'assistant', parts: [{ type: 'text' }, done] }])).toBe(false)
    })

    it('asks for the transcript when a call is left without its output', () => {
        expect(needsReconcile([user, { role: 'assistant', parts: [{ ...done, state: 'input-available' }] }])).toBe(true)
        expect(needsReconcile([user, { role: 'assistant', parts: [{ ...done, state: 'input-streaming' }] }])).toBe(true)
    })

    it('does not wait on the quick replies, which never get an output', () => {
        expect(needsReconcile([user, { role: 'assistant', parts: [{ type: 'text' }, { type: 'tool-suggest_replies', toolCallId: 'q1', state: 'input-available' }] }])).toBe(false)
        expect(needsReconcile([user, { role: 'assistant', parts: [{ type: 'text' }, { type: 'dynamic-tool', toolName: 'mcp__lumvika__suggest_replies', toolCallId: 'q1', state: 'input-available' }] }])).toBe(false)
    })

    it('does not mistake a pending approval for a missing output', () => {
        expect(needsReconcile([user, { role: 'assistant', parts: [{ ...done, state: 'approval-requested' }] }])).toBe(false)
    })

    it('asks for the transcript when a call is held twice', () => {
        const persisted = { type: 'tool-db_query', toolCallId: 'c1', state: 'output-available' }
        expect(needsReconcile([user, { role: 'assistant', parts: [persisted, done] }])).toBe(true)
    })
})
