import { describe, expect, it } from 'vitest'

import { projectProgress } from './project-progress'

describe('projectProgress', () => {
    it('counts done issues against the work that is not cancelled', () => {
        expect(projectProgress({ todo: 2, in_progress: 1, done: 3, cancelled: 4 })).toEqual({ done: 3, total: 6, open: 3, percent: 50 })
    })

    it('reads an empty project as nothing done', () => {
        expect(projectProgress({})).toEqual({ done: 0, total: 0, open: 0, percent: 0 })
    })
})
