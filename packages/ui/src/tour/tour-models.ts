import type { ModelPillItem } from '../beams'

// The model badges of the subscription slide: brand marks and model names surfacing over the board
// and going again, while the four model connectors plug themselves in underneath.
//
// The tiles say *which* providers a Box is wired to; these say *how many models* that buys. They are
// deliberately not anchored to a tile: the argument is the whole catalogue, not one connector, so
// they land all over the plan.
//
// Same rule as the rest of the tour: no Math.random anywhere. The order is written out, which also
// buys something an actual random cannot promise — no model ever pops twice in the same corner of
// the frame while the previous one is still standing there.

// Ring of anchors, read as **screen** offsets from the middle of the shot the camera is holding, and
// not as world coordinates: a badge is counter-scaled to keep a constant size on screen, so an
// anchor written in world units doubles its distance the moment the camera moves in on a Box, and
// half the ring leaves the frame. Divided by the zoom on the way out, the ring keeps exactly the
// same size on screen whatever plan the slide is played in.
//
// Both flanks only, nothing on the centre line. The middle of the frame is where the board itself is
// playing — the Box, the model marks lighting up and the cables drawing under them — and a badge
// landing there covers the very thing the slide is arguing. Three heights on each side, kept off the
// upper band so a badge never sits on the mark it is naming; at this zoom the flanks overlap the edge
// of the Box, which reads as a badge floating over the machine rather than as one covering it.
//
// Deliberately off the grid: no two anchors share a height, the two sides are not mirrors of each
// other, and each one sits at its own distance from the centre. Six anchors on two clean columns read
// as a layout the badges are being slotted into; scattered, they read as models surfacing wherever
// they land. Hand-placed rather than jittered at runtime, for the same reason the order is written
// out: the scatter has to be the same one every play, and one that never stacks two badges.
const SLOT_OFFSETS: readonly { x: number; y: number }[] = [
    { x: -326, y: -78 },
    { x: 288, y: -34 },
    { x: -272, y: 52 },
    { x: 338, y: 92 },
    { x: -348, y: 170 },
    { x: 300, y: 198 },
]

const WIDEST_SLOT = Math.max(...SLOT_OFFSETS.map(offset => Math.abs(offset.x)))
const TALLEST_SLOT = Math.max(...SLOT_OFFSETS.map(offset => Math.abs(offset.y)))

// Half the room a badge takes on screen. The ring is pulled in by however much its widest anchor
// overshoots the frame, so a badge is never clipped — that is 1 on a desktop dialog and a quarter on
// a 390px phone. Kept as two independent squeezes: a badge is wide and short, and a narrow frame is
// precisely the one with vertical room to spare, so squeezing both axes by the horizontal figure is
// what puts two of them on top of each other.
//
// The floor is only there to keep a frame narrower than a badge from inverting the ring: set high
// enough to matter on a real phone, it overrides the very squeeze that keeps the badge in frame, and
// the flanks are cut off by the edge of the scene.
const PILL_HALF_W = 108
const PILL_HALF_H = 22
const MIN_SPREAD = 0.15

// A pulled-in ring puts its anchors within a badge's width of each other, so a narrow frame carries
// one fewer badge at a time rather than two of them sharing a corner.
const TIGHT_SPREAD = 0.85

// The plan the badges are laid over: where the camera is looking, how close it is, and how much room
// the frame leaves around it. Everything the ring needs, resolved once per render by the board.
export type TourModelShot = { slots: readonly { x: number; y: number }[]; visible: number }

const VISIBLE_BEATS = 3

function squeeze(room: number, reach: number) {
    if (reach <= 0) return 1
    return Math.min(1, Math.max(MIN_SPREAD, room / reach))
}

export function tourModelShot(camera: { pan: { x: number; y: number }; zoom: number }, frame: { width: number; height: number }): TourModelShot {
    const spreadX = squeeze(frame.width / 2 - PILL_HALF_W, WIDEST_SLOT)
    const spreadY = squeeze(frame.height / 2 - PILL_HALF_H, TALLEST_SLOT)
    // Pan is applied inside the scale, so the world point held in the middle of the frame is simply
    // its opposite.
    const center = { x: -camera.pan.x, y: -camera.pan.y }
    return {
        slots: SLOT_OFFSETS.map(offset => ({ x: center.x + (offset.x * spreadX) / camera.zoom, y: center.y + (offset.y * spreadY) / camera.zoom })),
        visible: spreadX < TIGHT_SPREAD ? VISIBLE_BEATS - 1 : VISIBLE_BEATS,
    }
}

type TourModelBeat = { slot: number; model: ModelPillItem; hold: number }

export const TOUR_MODEL_BEATS: readonly TourModelBeat[] = [
    { slot: 0, model: { name: 'Claude Opus 4.8', logo: 'anthropic' }, hold: 1875 },
    { slot: 3, model: { name: 'GPT-5.6 Sol', logo: 'openai' }, hold: 1650 },
    { slot: 4, model: { name: 'Gemini 3.1 Pro', logo: 'googlegemini' }, hold: 2000 },
    { slot: 1, model: { name: 'Grok 4.6', logo: 'grok' }, hold: 1700 },
    { slot: 2, model: { name: 'Kimi K2.6', logo: 'moonshotai' }, hold: 1925 },
    { slot: 5, model: { name: 'DeepSeek V4 Pro', logo: 'deepseek' }, hold: 1575 },
    { slot: 0, model: { name: 'GLM-5.2', logo: 'zhipu' }, hold: 2050 },
    { slot: 1, model: { name: 'Qwen3.8 Max', logo: 'qwen' }, hold: 1750 },
    { slot: 2, model: { name: 'Claude Fable 5', logo: 'anthropic' }, hold: 1875 },
    { slot: 3, model: { name: 'MiniMax M3', logo: 'minimax' }, hold: 1650 },
    { slot: 4, model: { name: 'Mistral Large 3', logo: 'mistralai' }, hold: 2000 },
    { slot: 5, model: { name: 'GPT-5.6 Terra', logo: 'openai' }, hold: 1750 },
    { slot: 2, model: { name: 'Claude Sonnet 5', logo: 'anthropic' }, hold: 1925 },
    { slot: 1, model: { name: 'Gemini 3.5 Flash', logo: 'googlegemini' }, hold: 1700 },
]

export type TourModelPill = { key: string; x: number; y: number; item: ModelPillItem }

// Folded from the beat index rather than held in state, like tourTeamStateAt: the tick is monotone
// and the badges standing at tick n are the last few beats, so there is nothing to keep in sync.
export function tourModelPillsAt(index: number, shot: TourModelShot): TourModelPill[] {
    const pills: TourModelPill[] = []
    for (let back = shot.visible - 1; back >= 0; back--) {
        const at = index - back
        if (at < 0) continue
        const beat = TOUR_MODEL_BEATS[at % TOUR_MODEL_BEATS.length]
        const slot = shot.slots[beat.slot]
        pills.push({ key: `${at}`, x: slot.x, y: slot.y, item: beat.model })
    }
    return pills
}

// Under reduced motion nothing cycles, so the slide keeps the two badges the still frame reads best
// with: one on each flank, naming the two subscriptions most people arrive with.
export function tourModelStillPills(shot: TourModelShot): TourModelPill[] {
    return [
        { key: 'still-claude', ...shot.slots[0], item: { name: 'Claude Opus 4.8', logo: 'anthropic' } },
        { key: 'still-gpt', ...shot.slots[1], item: { name: 'GPT-5.6 Sol', logo: 'openai' } },
    ]
}

// The cascade of the slide needs to be done before the badges start: the four model marks land on a
// board that is already standing, then their beams draw. A badge surfacing over a tile still falling
// reads as a glitch. The slide is played wide and opens on no camera move at all, so this is counted
// from the moment the words come in.
export const TOUR_MODEL_PILLS_START = 1400
