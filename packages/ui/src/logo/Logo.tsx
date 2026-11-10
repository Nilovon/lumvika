import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../cn'

// Marque Lumvika, un L et un point (viewBox 0 0 512 512, centrée).
export const MARK_PATH =
    'M138 112A38 38 0 0 1 214 112V330H368A38 38 0 0 1 368 406H176A38 38 0 0 1 138 368ZM344 92A60 60 0 1 1 344 212A60 60 0 1 1 344 92Z'

// Même traitement que <Icon> (cf. ServiceList) : carré bordé, grille carrée
// atténuée+fondue en radial, reflet lumineux centré, glyph (la marque) par-dessus.
const logoVariants = cva(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/5 text-foreground',
    {
        variants: {
            size: {
                sm: 'size-8',
                md: 'size-10',
                lg: 'size-12',
                xl: 'size-16',
            },
        },
        defaultVariants: { size: 'md' },
    },
)

type LogoProps = React.ComponentProps<'span'> & VariantProps<typeof logoVariants>

// Border « double shimmer » statique (même motif conic que .glow-overlay côté
// landing, sans animation) : deux éclats opposés haut-gauche / bas-droit qui
// donnent du relief à la bordure. Cet anneau EST la bordure de la boîte (pas de
// `border` sur le conteneur, sinon les deux se cumulent en double liseré) : sa
// partie atténuée reprend donc l'intensité de --border.
const SHIMMER_BRIGHT = 'var(--logo-shimmer-bright)'
const SHIMMER_DIM = 'var(--logo-shimmer-dim)'

export function Logo({ size = 'md', className, ...rest }: LogoProps) {
    const id = React.useId() // id de pattern SSR-safe par instance
    return (
        <span data-slot="logo" className={cn(logoVariants({ size }), className)} {...rest}>
            {/* grille carrée faible — currentColor hérite de text-foreground, atténué par
                --logo-grid-opacity (bien plus bas en clair, cf. styles.css).
                Fondue vers les bords via un masque radial (effet fade).
                Cellule en % : 4 cellules quelle que soit la boîte, même forcée via className.
                Le décalage d'une demi-cellule centre le R DANS une cellule (sinon un trait
                passe pile dessous et les bords droit/bas restent nus). Le tracé déborde
                volontairement : le motif le clippe à la cellule. */}
            <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full text-foreground"
                style={{
                    opacity: 'var(--logo-grid-opacity)',
                    maskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 90%)',
                    WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 90%)',
                }}
            >
                <defs>
                    <pattern id={id} x="12.5%" y="12.5%" width="25%" height="25%" patternUnits="userSpaceOnUse">
                        <path d="M 512 0 L 0 0 L 0 512" fill="none" stroke="currentColor" strokeWidth={0.5} />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#${id})`} />
            </svg>

            {/* effet de lumière : reflet doux centré */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        'radial-gradient(circle at 50% 50%, rgb(var(--icon-glint) / var(--icon-glint-core)), rgb(var(--icon-glint) / var(--icon-glint-halo)) 45%, transparent 70%)',
                }}
            />

            {/* anneau shimmer par-dessus la bordure : conic à angle fixe, masqué
                pour ne garder que le 1px du pourtour (mask xor content-box) */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
                style={{
                    padding: 1,
                    background: `conic-gradient(from 279deg, ${SHIMMER_DIM} 0%, ${SHIMMER_BRIGHT} 10%, ${SHIMMER_DIM} 22%, ${SHIMMER_DIM} 50%, ${SHIMMER_BRIGHT} 60%, ${SHIMMER_DIM} 72%, ${SHIMMER_DIM} 100%)`,
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                }}
            />

            {/* le R, par-dessus — 50% du conteneur pour suivre n'importe quelle taille */}
            <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden className="relative z-10 h-1/2 w-1/2">
                <path fillRule="evenodd" d={MARK_PATH} />
            </svg>
        </span>
    )
}
