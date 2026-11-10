import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { brandIconFilter } from '../brand-icon'
import { BorderBeam, type BorderBeamProps } from '../BorderBeam'
import { cn } from '../cn'

const iconVariants = cva(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/5 text-foreground',
    {
        variants: {
            size: {
                xs: "size-5 rounded-md [&_svg:not([class*='size-'])]:size-2.5",
                sm: "size-8 [&_svg:not([class*='size-'])]:size-3.5",
                md: "size-10 [&_svg:not([class*='size-'])]:size-[1.125rem]",
                lg: "size-12 [&_svg:not([class*='size-'])]:size-[1.375rem]",
                xl: "size-16 [&_svg:not([class*='size-'])]:size-[1.875rem]",
                // La case qui contient l'icône porte déjà bordure et fond (mur de connecteurs) :
                // la boîte s'efface et se contente de remplir, le glyph suit en pourcentage.
                fill: "size-full rounded-none bg-transparent [&_svg:not([class*='size-'])]:size-[38%]",
            },
        },
        defaultVariants: { size: 'md' },
    },
)

// Le cva ne peut pas injecter de nombres dans le SVG : table parallèle pour la taille
// de cellule de la grille (≈ boîte/4 → ~4 cellules).
const CELL: Record<NonNullable<VariantProps<typeof iconVariants>['size']>, number> = {
    xs: 5,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
    fill: 12,
}

// Oriente le beam différemment d'une instance à l'autre pour que deux boîtes voisines ne portent
// pas le même contour. Dérivé de l'id React plutôt que d'un Math.random() : le serveur et le client
// doivent tomber sur la même valeur, sinon l'hydratation casse. Les ids étant séquentiels, le
// facteur 31 (premier avec 360) écarte deux boîtes consécutives d'une trentaine de degrés.
function beamAngleFrom(id: string) {
    let hash = 0
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
    return Math.abs(hash) % 360
}

// Taille du glyph/image, alignée sur les variantes SVG du cva ci-dessus (une <img> de marque
// n'hérite pas du sélecteur `[&_svg…]`, donc on la dimensionne explicitement).
const GLYPH_SIZE: Record<NonNullable<VariantProps<typeof iconVariants>['size']>, string> = {
    xs: 'size-2.5',
    sm: 'size-3.5',
    md: 'size-[1.125rem]',
    lg: 'size-[1.375rem]',
    xl: 'size-[1.875rem]',
    fill: 'size-[38%]',
}

// Soit une icône Lucide, soit une image de marque (logo), exclusifs. Les couleurs source restent
// intactes ; seul un asset marqué `tone=dark` est blanchi sur une surface sombre, et un asset
// marqué `tone=light` noirci sur une surface claire.
// Accepts any component taking a className (Lucide icons or plain glyphs).
type IconGlyph = { icon: React.ComponentType<{ className?: string }>; src?: never } | { src: string; icon?: never }

type IconProps = React.ComponentProps<'span'> &
    VariantProps<typeof iconVariants> &
    IconGlyph & {
        // La bordure de la boîte est un BorderBeam statique : sa couleur passe par ce ton,
        // pas par une classe `border-*` (le beam est un overlay, il n'a pas de bordure CSS).
        tone?: BorderBeamProps['tone']
        // Une grille de logos hors écran (mur de connecteurs) doit pouvoir différer ses images :
        // sans ça chaque <img> part en eager et se bat avec le visuel du haut de page.
        loading?: 'eager' | 'lazy'
        // `className` habille la boîte : une animation posée dessus fait tourner la boîte entière,
        // grille et bordure comprises. Ce qui bouge (un spinner) se déclare ici.
        glyphClassName?: string
    }

function Icon({ size = 'md', tone = 'neutral', className, glyphClassName, loading, ...props }: IconProps) {
    const { icon: Glyph, src, ...rest } = props as { icon?: React.ComponentType<{ className?: string }>; src?: string } & React.ComponentProps<'span'>
    const id = React.useId() // id de pattern SSR-safe par instance
    const c = CELL[size ?? 'md']
    return (
        <span data-slot="icon" data-size={size} className={cn(iconVariants({ size }), className)} {...rest}>
            {size !== 'fill' && <BorderBeam tone={tone} animated={false} angle={beamAngleFrom(id)} />}
            {/* grille carrée faible — currentColor hérite de text-foreground, atténué par
                --icon-grid-opacity (bien plus bas en clair, cf. styles.css).
                Fondue vers les bords via un masque radial (effet fade). */}
            <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full text-foreground"
                style={{
                    opacity: 'var(--icon-grid-opacity)',
                    maskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 78%)',
                    WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 78%)',
                }}
            >
                <defs>
                    <pattern id={id} width={c} height={c} patternUnits="userSpaceOnUse">
                        <path d={`M ${c} 0 L 0 0 L 0 ${c}`} fill="none" stroke="currentColor" strokeWidth={0.5} />
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
            {src ? (
                // Logo de marque : couleurs natives, centré, sans déformation. Le filtre adaptatif
                // n'est posé que pour un logo trop sombre ou trop clair, et hérite du thème de la
                // surface la plus proche.
                <img
                    src={src}
                    alt=""
                    aria-hidden
                    loading={loading}
                    decoding={loading === 'lazy' ? 'async' : undefined}
                    className={cn('relative z-10 object-contain', GLYPH_SIZE[size ?? 'md'], glyphClassName)}
                    style={{ filter: brandIconFilter(src) }}
                />
            ) : (
                Glyph && <Glyph className={cn('relative z-10', glyphClassName)} />
            )}
        </span>
    )
}

export { Icon, iconVariants }
