import type { LanguageModelMiddleware } from 'ai'
import { logger } from '../lib/logger.js'

// A model sometimes types a tool call as text in the legacy XML format instead of making it, then
// goes on to write its result, the user's answers included. Nothing reached the user, and the
// history replayed on the next turn would hold answers they never gave.
export const FAKE_TOOL_CALL_MARKERS = ['<function_calls>', '<function_results>'] as const

const FENCE = /^\s*```/

const opensFakeCall = (line: string): boolean => {
    const start = line.trimStart()
    return FAKE_TOOL_CALL_MARKERS.some(marker => start.startsWith(marker))
}

const couldOpenFakeCall = (line: string): boolean => {
    const start = line.trimStart()
    return FAKE_TOOL_CALL_MARKERS.some(marker => marker.startsWith(start))
}

// `released` counts the characters of the current line already sent: a line partly out can no
// longer open a fake call. `gap` is trailing whitespace held back so a cut leaves none behind.
type LineState = { line: string; released: number; inFence: boolean; gap: string }

// Cuts one model call's text at the first fake call, delta by delta. A marker only counts at the
// start of a line and outside a code fence, so a coworker writing about the format keeps its text.
// Only the start of a line that could still become a marker is held back. Once a marker shows up,
// every later text of the call goes too: it is written as if the user had answered.
export class FakeToolCallSplitter {
    private readonly states = new Map<string, LineState>()
    private cut = false

    constructor(private readonly onCut: () => void) {}

    delta(id: string, delta: string): string[] {
        if (this.cut) return []
        const state = this.states.get(id) ?? { line: '', released: 0, inFence: false, gap: '' }
        this.states.set(id, state)
        let out = ''
        const emit = (text: string) => {
            const combined = state.gap + text
            const kept = combined.trimEnd().length
            out += combined.slice(0, kept)
            state.gap = combined.slice(kept)
        }
        let rest = delta
        while (rest) {
            const newline = rest.indexOf('\n')
            const piece = newline < 0 ? rest : rest.slice(0, newline + 1)
            rest = newline < 0 ? '' : rest.slice(newline + 1)
            state.line += piece
            if (!state.inFence && state.released === 0 && opensFakeCall(state.line)) {
                this.cut = true
                this.states.clear()
                this.onCut()
                return out ? [out] : []
            }
            if (piece.endsWith('\n')) {
                if (FENCE.test(state.line)) state.inFence = !state.inFence
                emit(state.line.slice(state.released))
                state.line = ''
                state.released = 0
            } else if (state.inFence || state.released > 0 || !couldOpenFakeCall(state.line)) {
                emit(state.line.slice(state.released))
                state.released = state.line.length
            }
        }
        return out ? [out] : []
    }

    end(id: string): string[] {
        const state = this.states.get(id)
        this.states.delete(id)
        if (this.cut || !state) return []
        const rest = state.gap + state.line.slice(state.released)
        return rest ? [rest] : []
    }
}

type StreamPart = { type: string; id?: string; delta?: string; text?: string }

export function createFakeToolCallGuard(agentId: string): LanguageModelMiddleware {
    const splitter = () => new FakeToolCallSplitter(() => logger.warn({ agentId }, 'fake tool call cut from model text'))

    return {
        specificationVersion: 'v3',
        async wrapStream({ doStream }) {
            const result = await doStream()
            const split = splitter()
            return {
                ...result,
                stream: result.stream.pipeThrough(
                    new TransformStream<StreamPart, StreamPart>({
                        transform(part, controller) {
                            if (part.type === 'text-delta' && typeof part.id === 'string' && typeof part.delta === 'string') {
                                for (const delta of split.delta(part.id, part.delta)) controller.enqueue({ ...part, delta })
                                return
                            }
                            if (part.type === 'text-end' && typeof part.id === 'string') {
                                for (const delta of split.end(part.id)) controller.enqueue({ type: 'text-delta', id: part.id, delta })
                            }
                            controller.enqueue(part)
                        },
                    }) as TransformStream,
                ),
            }
        },
        async wrapGenerate({ doGenerate }) {
            const result = await doGenerate()
            const split = splitter()
            const content = result.content.flatMap((part, index): (typeof result.content)[number][] => {
                if (part.type !== 'text') return [part]
                const id = String(index)
                const text = [...split.delta(id, part.text), ...split.end(id)].join('')
                if (text === part.text) return [part]
                return text ? [{ ...part, text }] : []
            })
            return { ...result, content }
        },
    }
}
