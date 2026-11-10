import { describe, expect, it } from 'vitest'

import { planLifeAt, planLifeBeats, planLifeScript } from './plan-life'

const DAY = { trigger: 'New email: where is my order?', working: 'Reading order #4812', delivered: 'Reply drafted for you' }

describe('planLifeScript', () => {
    it('plays the day the model wrote', () => {
        expect(planLifeScript({ beats: DAY, when: 'When an email comes in' })).toBe(DAY)
    })

    it('plays a plain day off what sets the agent off when the model wrote none', () => {
        expect(planLifeScript({ when: ' Every Monday at 8am ' })).toEqual({ trigger: 'Every Monday at 8am', working: 'Working on it', delivered: 'Handed over to you' })
    })

    it('has no day to play for an item that says neither', () => {
        expect(planLifeScript({ when: '' })).toBeNull()
    })
})

describe('planLifeBeats', () => {
    const beats = planLifeBeats(DAY)

    it('opens at rest, long enough for the tile to land before it changes colour', () => {
        expect(beats[0]).toMatchObject({ stage: 'rest', status: 'idle', line: null })
        expect(beats[0].hold).toBeGreaterThanOrEqual(1900)
    })

    it('lights the tile up for the work alone', () => {
        expect(beats.filter(beat => beat.status !== 'idle').map(beat => beat.stage)).toEqual(['working'])
    })

    it('says each line of the day in its turn', () => {
        expect(beats.map(beat => beat.line)).toEqual([null, DAY.trigger, DAY.working, DAY.delivered])
    })

    it('loops back onto the rest it opened on', () => {
        expect(planLifeAt(beats, beats.length)).toBe(beats[0])
        expect(planLifeAt(beats, beats.length + 2).stage).toBe('working')
    })
})
