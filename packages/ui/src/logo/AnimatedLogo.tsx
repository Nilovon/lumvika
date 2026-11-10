'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../cn'
import { MARK_PATH } from './Logo'

// La marque est composée de 3 sous-paths (l'anneau, la lumière, le noyau) :
// on les sépare pour pouvoir les dessiner en cascade (stagger).
const MARK_SUBPATHS = MARK_PATH.split(/(?=M)/).map((s) => s.trim())

// Surface d'eau pour le mask de remplissage : sinusoïde de période 256,
// large de 1024 (> 512 + une période) pour pouvoir défiler en translateX
// de -256px en boucle sans couture. Profondeur 600 pour couvrir tout le
// viewBox une fois le niveau monté.
const WAVE_PATH =
    'M0 24 Q64 0 128 24 T256 24 T384 24 T512 24 T640 24 T768 24 T896 24 T1024 24 V600 H0 Z'

// Positions du niveau d'eau (translateY du groupe vague, en unités viewBox) :
// en bas = entièrement sous le viewBox, en haut = crêtes au-dessus de la marque.
const WATER_DOWN = 'translateY(560px)'
const WATER_UP = 'translateY(-60px)'

// Même boîte que <Logo>, sans la grille ni le reflet : sur un écran de
// chargement la marque animée porte seul l'attention.
const animatedLogoVariants = cva(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden text-foreground',
    {
        variants: {
            size: {
                sm: 'size-8',
                md: 'size-10',
                lg: 'size-12',
                xl: 'size-16',
                '2xl': 'size-24',
                '3xl': 'size-40',
            },
            // frame : la boîte arrondie qui englobe le R (comme <Logo>).
            // false = le R seul, pour les écrans de chargement.
            frame: {
                true: 'rounded-lg border border-border bg-primary/5',
                false: '',
            },
        },
        defaultVariants: { size: 'md', frame: true },
    },
)

type AnimatedLogoProps = React.ComponentProps<'span'> &
    VariantProps<typeof animatedLogoVariants> & {
        /** true (défaut) : boucle infinie (loading). false : joue une fois et reste rempli. */
        loop?: boolean
        /** Durée d'un cycle en secondes. */
        duration?: number
    }

// Cycle : le contour se trace pendant que le niveau d'eau monte (la vague
// ondule en continu via une animation séparée), puis tenue, puis fondu (loop).
// Le saut de fin (opacity 0 → état initial) est invisible car au départ rien
// n'est tracé (dashoffset plein) et l'eau est sous le viewBox.
const KEYFRAMES = `
@keyframes lumvika-logo-draw-loop {
  0%        { stroke-dashoffset: 1; }
  45%, 100% { stroke-dashoffset: 0; }
}
@keyframes lumvika-logo-draw-once {
  0%        { stroke-dashoffset: 1; }
  60%, 100% { stroke-dashoffset: 0; }
}
@keyframes lumvika-logo-rise-loop {
  0%, 38%   { transform: ${WATER_DOWN}; }
  78%, 100% { transform: ${WATER_UP}; }
}
@keyframes lumvika-logo-rise-once {
  0%, 52%   { transform: ${WATER_DOWN}; }
  90%, 100% { transform: ${WATER_UP}; }
}
@keyframes lumvika-logo-wave {
  from { transform: translateX(0); }
  to   { transform: translateX(-256px); }
}
@keyframes lumvika-logo-fade {
  0%, 85% { opacity: 1; }
  100%    { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-slot="animated-logo"] svg, [data-slot="animated-logo"] svg * { animation: none !important; }
  [data-slot="animated-logo"] path { stroke-dashoffset: 0 !important; }
  [data-slot="animated-logo"] [data-water] { transform: ${WATER_UP} !important; }
}
`

export function AnimatedLogo({ size = 'md', frame = true, loop = true, duration, className, ...rest }: AnimatedLogoProps) {
    const id = React.useId() // id de mask SSR-safe par instance
    const cycle = duration ?? (loop ? 2.8 : 1.8)
    return (
        <span data-slot="animated-logo" className={cn(animatedLogoVariants({ size, frame }), className)} {...rest}>
            <style>{KEYFRAMES}</style>
            <svg
                viewBox="0 0 512 512"
                aria-hidden
                className="relative h-1/2 w-1/2 overflow-visible"
                style={loop ? { animation: `lumvika-logo-fade ${cycle}s ease-in-out infinite` } : undefined}
            >
                <defs>
                    <mask id={`water-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
                        {/* niveau qui monte (translateY) × vague qui défile (translateX) */}
                        <g data-water style={{ transform: WATER_DOWN, animation: `lumvika-logo-rise-${loop ? 'loop' : 'once'} ${cycle}s ease-in-out ${loop ? 'infinite' : 'forwards'}` }}>
                            <path d={WAVE_PATH} fill="#fff" style={{ animation: 'lumvika-logo-wave 1.4s linear infinite' }} />
                        </g>
                    </mask>
                </defs>

                {/* contour : se dessine en cascade */}
                {MARK_SUBPATHS.map((d, i) => (
                    <path
                        key={i}
                        d={d}
                        pathLength={1}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={10}
                        strokeLinejoin="round"
                        style={{
                            strokeDasharray: 1,
                            strokeDashoffset: 1,
                            animation: `lumvika-logo-draw-${loop ? 'loop' : 'once'} ${cycle}s ease-in-out ${i * cycle * 0.1}s ${loop ? 'infinite' : 'forwards'}`,
                        }}
                    />
                ))}

                {/* remplissage : révélé par la vague qui monte */}
                <path d={MARK_PATH} fillRule="evenodd" fill="currentColor" mask={`url(#water-${id})`} />
            </svg>
        </span>
    )
}
