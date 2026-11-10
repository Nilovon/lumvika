export type StewardMaterialKey = 'platinum' | 'gold' | 'chrome' | 'obsidian' | 'holo' | 'glass'

type Stop = [offset: number, color: string]

export type StewardMaterial = {
    label: string
    // Across the two visible walls: 0 is the left silhouette, 0.5 the front fold, 1 the right one.
    side: Stop[]
    // How dark the walls get towards the floor.
    shade: number
    top: [lit: string, far: string]
    topGloss: number
    // The lit chamfer under the top's front edges.
    bevel: string
    outline: string[]
    // The outline glows and runs down the fold and around the base, like the orb's rim.
    neon?: boolean
    sheen: string
    plate: [upper: string, lower: string]
    eyeTint: string
    eyeLight: string
    // The ink of a face set straight into the material, without a plate.
    bareInk: 'light' | 'dark'
    aura?: string
    ball: StewardBallPaint
}

export type StewardBallPaint = {
    // From the hot spot on the upper left out to the far silhouette.
    stops: Stop[]
    // The light the floor sends back into the lower right.
    bounce: string
    // The dark line a mirror shows where the room meets the floor: what tells chrome from grey.
    horizon?: string
}

export const STEWARD_MATERIALS: Record<StewardMaterialKey, StewardMaterial> = {
    platinum: {
        label: 'Platinum',
        side: [[0, '#dfe3ea'], [0.1, '#ffffff'], [0.26, '#b4bac6'], [0.4, '#d6dae3'], [0.49, '#eef0f5'], [0.52, '#7a8090'], [0.68, '#565b69'], [0.86, '#8d93a2'], [1, '#42464f']],
        shade: 0.3,
        top: ['#ffffff', '#cdd2dc'],
        topGloss: 0.55,
        bevel: '#ffffff',
        outline: ['#ffffff'],
        sheen: '#ffffff',
        plate: ['#2b2e3a', '#0b0c11'],
        eyeTint: '#c8d2ff',
        eyeLight: '#dfe6ff',
        bareInk: 'dark',
        ball: { stops: [[0, '#ffffff'], [0.25, '#e3e6ed'], [0.55, '#aab0bd'], [0.82, '#6b7080'], [1, '#454955']], bounce: '#dfe3ea' },
    },
    gold: {
        label: 'Gold',
        side: [[0, '#f3cf63'], [0.1, '#fff6cf'], [0.26, '#d19c2c'], [0.4, '#f0c655'], [0.49, '#ffe9a3'], [0.52, '#9a6a17'], [0.68, '#74500f'], [0.86, '#b98a2a'], [1, '#573a09']],
        shade: 0.3,
        top: ['#fff7d6', '#e6b84a'],
        topGloss: 0.5,
        bevel: '#fff6cf',
        outline: ['#fff3c4'],
        sheen: '#fffbe6',
        plate: ['#33240a', '#0f0a02'],
        eyeTint: '#ffd76a',
        eyeLight: '#ffe9a3',
        bareInk: 'dark',
        ball: { stops: [[0, '#fffbe6'], [0.22, '#ffe08a'], [0.52, '#dba632'], [0.8, '#96660f'], [1, '#5b3c08']], bounce: '#ffd76a' },
    },
    chrome: {
        label: 'Chrome',
        side: [[0, '#aab2c2'], [0.08, '#ffffff'], [0.2, '#8b94a8'], [0.3, '#1d212b'], [0.4, '#dfe4ee'], [0.49, '#ffffff'], [0.52, '#0d0f15'], [0.66, '#4d5464'], [0.8, '#c9cfdb'], [0.9, '#2a2e39'], [1, '#12141a']],
        shade: 0.2,
        top: ['#ffffff', '#8c95a9'],
        topGloss: 0.75,
        bevel: '#ffffff',
        outline: ['#ffffff'],
        sheen: '#ffffff',
        plate: ['#1c1f29', '#050609'],
        eyeTint: '#9fd4ff',
        eyeLight: '#cfeaff',
        bareInk: 'dark',
        ball: { stops: [[0, '#ffffff'], [0.2, '#dfe4ee'], [0.5, '#8b94a8'], [0.78, '#2a2e39'], [1, '#0d0f15']], bounce: '#cfd6e4', horizon: '#0d0f15' },
    },
    obsidian: {
        label: 'Obsidian neon',
        side: [[0, '#2d1769'], [0.14, '#3a1f85'], [0.34, '#1b0c48'], [0.49, '#241056'], [0.52, '#0d0428'], [0.8, '#0a0322'], [1, '#050114']],
        shade: 0.25,
        top: ['#3f2391', '#170a3d'],
        topGloss: 0.22,
        bevel: '#c05cff',
        outline: ['#ffdcf8', '#ff7ae2', '#c05cff', '#7b45ff', '#0b6e63', '#b968ff', '#ffdcf8'],
        neon: true,
        sheen: '#f0e2ff',
        plate: ['#150835', '#04010f'],
        eyeTint: '#d9b8ff',
        eyeLight: '#ffdcf8',
        bareInk: 'light',
        aura: '#0b6e63',
        ball: { stops: [[0, '#5a36c4'], [0.3, '#3a1f85'], [0.6, '#1b0c48'], [0.85, '#0d0428'], [1, '#050114']], bounce: '#7b45ff' },
    },
    holo: {
        label: 'Holo pearl',
        side: [[0, '#ffd9f3'], [0.12, '#ffffff'], [0.24, '#cdbcff'], [0.36, '#b3e4ff'], [0.49, '#c8ffe8'], [0.52, '#8a79d6'], [0.66, '#6a8fdc'], [0.82, '#74c2c9'], [1, '#5a4c9c']],
        shade: 0.22,
        top: ['#ffffff', '#e0d0ff'],
        topGloss: 0.6,
        bevel: '#ffffff',
        outline: ['#ffd9f3', '#cdbcff', '#b3e4ff', '#c8ffe8', '#ffd9f3'],
        sheen: '#ffffff',
        plate: ['#231a4a', '#090516'],
        eyeTint: '#b3e4ff',
        eyeLight: '#ffd9f3',
        bareInk: 'dark',
        ball: { stops: [[0, '#ffffff'], [0.22, '#ffd9f3'], [0.45, '#cdbcff'], [0.65, '#b3e4ff'], [0.82, '#8a79d6'], [1, '#5a4c9c']], bounce: '#c8ffe8' },
    },
    glass: {
        label: 'Indigo glass',
        side: [[0, '#6f5cff'], [0.08, '#d5ceff'], [0.18, '#5a44f8'], [0.4, '#0b6e63'], [0.49, '#66cdb9'], [0.52, '#0a4f48'], [0.74, '#1c1180'], [0.92, '#4734d6'], [1, '#06302c']],
        shade: 0.28,
        top: ['#7fdccb', '#0b6e63'],
        topGloss: 0.6,
        bevel: '#dcf7f0',
        outline: ['#ffffff'],
        sheen: '#ffffff',
        plate: ['#06302c', '#021512'],
        eyeTint: '#9fe8d8',
        eyeLight: '#dcf7f0',
        bareInk: 'light',
        aura: '#0b6e63',
        ball: { stops: [[0, '#dcf7f0'], [0.2, '#7fdccb'], [0.5, '#0b6e63'], [0.8, '#0a4f48'], [1, '#06302c']], bounce: '#66cdb9' },
    },
}

export const STEWARD_MATERIAL_KEYS = Object.keys(STEWARD_MATERIALS) as StewardMaterialKey[]

// An agent's walls are 15 high on the board and 30 away from it: the first step is an agent's own
// height, every other one stands above it.
export const STEWARD_HEIGHTS = [
    { depth: 30, label: 'Agent' },
    { depth: 48, label: 'Tall' },
    { depth: 66, label: 'Taller' },
    { depth: 84, label: 'Tower' },
]

// A ball's diameter, as a share of an agent's width.
export const STEWARD_BALL_SIZES = [
    { scale: 1, label: 'Agent' },
    { scale: 1.15, label: 'Big' },
    { scale: 1.3, label: 'Bigger' },
    { scale: 1.5, label: 'Huge' },
]
