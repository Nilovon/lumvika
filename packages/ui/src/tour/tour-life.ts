// What the seven agents of the tour board do while the words are being read. A written score, not a
// draw: the previous version had each tile roll its own status every second or two, and a dozen
// diamonds changing colour out of sync reads as a string of Christmas lights rather than as a team
// at work. Same lesson, and same shape, as the auth scene's STATUS_CHANGES.
//
// Three rules hold the calm, and none of them is the palette — the tiles carry the product's real
// statuses, amber `working` and cyan `waiting_human`:
//
// - every agent plays the same useful story: work, ask for a decision, resume, then finish;
// - working holds for at least five seconds, waiting for a human for ten, and idle for three;
// - changes are staggered, one tile per beat and never more than three live at once.
//
// The cables stay plugged. An agent at work does not light the beam of one of its connectors: that
// pulse fires on a link that is already drawn, so it adds a second moving thing per agent for no
// argument the tile's own colour is not already making.

export type TourLifeStatus = 'working' | 'waiting_human' | 'idle'

// `hold` is how long this beat stays on screen, so it is really the gap until the *next* change.
export type TourLifeBeat = { agent: string; status: TourLifeStatus; hold: number }

// Ninety-four seconds end to end. Each agent follows idle -> working -> waiting_human -> working ->
// idle, and the loop closes with six seconds where the whole board is idle. The holds are deliberately
// uneven — a constant step is a metronome, and the scene starts beating the measure after two turns.
export const TOUR_LIFE_BEATS: readonly TourLifeBeat[] = [
    { agent: 'tour-writer', status: 'working', hold: 6000 },
    { agent: 'tour-writer', status: 'waiting_human', hold: 7000 },
    { agent: 'tour-research', status: 'working', hold: 3000 },
    { agent: 'tour-writer', status: 'working', hold: 3000 },
    { agent: 'tour-research', status: 'waiting_human', hold: 3000 },
    { agent: 'tour-watch', status: 'working', hold: 2000 },
    { agent: 'tour-writer', status: 'idle', hold: 4000 },
    { agent: 'tour-watch', status: 'waiting_human', hold: 2000 },
    { agent: 'tour-research', status: 'working', hold: 4000 },
    { agent: 'tour-docs', status: 'working', hold: 2000 },
    { agent: 'tour-research', status: 'idle', hold: 2000 },
    { agent: 'tour-watch', status: 'working', hold: 3000 },
    { agent: 'tour-docs', status: 'waiting_human', hold: 3000 },
    { agent: 'tour-social', status: 'working', hold: 2000 },
    { agent: 'tour-watch', status: 'idle', hold: 3000 },
    { agent: 'tour-social', status: 'waiting_human', hold: 2000 },
    { agent: 'tour-docs', status: 'working', hold: 3000 },
    { agent: 'tour-invoices', status: 'working', hold: 3000 },
    { agent: 'tour-docs', status: 'idle', hold: 3000 },
    { agent: 'tour-social', status: 'working', hold: 2000 },
    { agent: 'tour-invoices', status: 'waiting_human', hold: 2000 },
    { agent: 'tour-desk', status: 'working', hold: 4000 },
    { agent: 'tour-social', status: 'idle', hold: 2000 },
    { agent: 'tour-desk', status: 'waiting_human', hold: 3000 },
    { agent: 'tour-invoices', status: 'working', hold: 5000 },
    { agent: 'tour-invoices', status: 'idle', hold: 3000 },
    { agent: 'tour-desk', status: 'working', hold: 7000 },
    { agent: 'tour-desk', status: 'idle', hold: 6000 },
]

// The score is armed on the slide the agents land on, so this is the whole cascade of that slide
// plus a breath: the last of the seven is dropped at 1400ms and has finished falling a second later,
// and the board is then left alone for a moment. A tile that starts working while its neighbour is
// still falling reads as one more thing landing rather than as an agent taking a job.
export const TOUR_LIFE_START = 3200

// Folded from the beat index rather than held in state, like tourTeamStateAt. Nothing needs to be
// carried over from the previous turn of the loop: the score ends on the board it starts from, every
// agent idle.
export function tourLifeAt(index: number): Record<string, TourLifeStatus> {
    const statuses: Record<string, TourLifeStatus> = {}
    for (let i = 0; i <= index % TOUR_LIFE_BEATS.length; i++) {
        const beat = TOUR_LIFE_BEATS[i]
        statuses[beat.agent] = beat.status
    }
    return statuses
}

// The frame reduced motion freezes on: two agents at work, one waiting on someone. A board where
// nothing is happening is not calm, it is switched off.
export const TOUR_LIFE_STILL: Record<string, TourLifeStatus> = {
    'tour-writer': 'working',
    'tour-research': 'waiting_human',
    'tour-docs': 'working',
}
