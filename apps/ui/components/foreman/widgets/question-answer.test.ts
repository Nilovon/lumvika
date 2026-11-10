import { describe, expect, it } from 'vitest'

import { readQuestionOutput } from './question-answer'

describe('readQuestionOutput', () => {
    it('keeps why a question closed without an answer', () => {
        expect(readQuestionOutput({ answered: false, reason: 'neither' })).toEqual({ answered: false, reason: 'neither' })
        expect(readQuestionOutput({ answered: false, reason: 'typed' })).toEqual({ answered: false, reason: 'typed' })
    })

    it('reads a transcript written before the reason existed, or with one it does not know, as plainly unanswered', () => {
        expect(readQuestionOutput({ answered: false })).toEqual({ answered: false })
        expect(readQuestionOutput({ answered: false, reason: 'bored' })).toEqual({ answered: false })
    })

    it('reads an answer, and nothing when the question is still open', () => {
        expect(readQuestionOutput({ answered: true, question: 'Which?', answers: ['This one'] })).toEqual({ answered: true, question: 'Which?', answers: ['This one'] })
        expect(readQuestionOutput(undefined)).toBeNull()
    })
})
