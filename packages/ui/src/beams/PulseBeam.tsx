'use client'

import { motion } from 'motion/react'

const HEAD_LEN = 4
const MAX_LEN = 36
const STEPS = 16

function mix(a: string, b: string, t: number) {
    const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
    const [ar, ag, ab] = parse(a)
    const [br, bg, bb] = parse(b)
    const c = (x: number, y: number) => Math.round(x + (y - x) * t)
    return `rgb(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)})`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const TAIL_COLOR = '#4028d9'
const HEAD_COLOR = '#f5ecff'

// Comète en dégradé continu : chaque couche est le même pulse décalé pour
// aligner la tête, la longueur croît vers la queue. En interpolant finement
// couleur/opacité/épaisseur sur beaucoup de pas, la tête vive fond en une
// traînée sombre sans bandes visibles. t = 0 → queue, t = 1 → tête.
const TRAIL = Array.from({ length: STEPS }, (_, i) => {
    const t = i / (STEPS - 1)
    return {
        len: lerp(MAX_LEN, HEAD_LEN, t),
        color: mix(TAIL_COLOR, HEAD_COLOR, t),
        opacity: lerp(0.05, 0.95, t),
        width: lerp(3, 1, t),
    }
})

// La tête voyage de P_START (avant le nœud, hors-chemin) à P_END (au-delà du
// centre, hors-chemin). Au repos — avant le delay initial et pendant les
// pauses — la comète est donc entièrement hors du tracé, donc invisible : plus
// de stub mauve figé au démarrage. strokeDashoffset = len - p aligne les têtes.
const P_START = -8
const P_END = 138

// Un faisceau qui parcourt `d` en boucle. `pathLength={100}` normalise chaque tracé, donc les
// longueurs et positions de tirets sont des pourcentages quelle que soit la longueur réelle.
export function PulseBeam({ d, dur, delay, gap }: { d: string; dur: number; delay: number; gap: number }) {
    const transition = { duration: dur, ease: 'linear' as const, repeat: Infinity, repeatDelay: gap, delay }
    return (
        <>
            {TRAIL.map((t, i) => (
                <motion.path
                    key={i}
                    d={d}
                    pathLength={100}
                    fill="none"
                    stroke={t.color}
                    strokeOpacity={t.opacity}
                    strokeWidth={t.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${t.len} 1000`}
                    initial={{ strokeDashoffset: t.len - P_START }}
                    animate={{ strokeDashoffset: t.len - P_END }}
                    transition={transition}
                />
            ))}
        </>
    )
}
