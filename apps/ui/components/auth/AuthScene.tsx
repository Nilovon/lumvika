'use client'

import { useResolvedIsMobile } from '@lumvika/ui/primitives/use-is-mobile'
import { AuthStageBoard } from './AuthStageBoard'

// Le décor plein cadre des surfaces d'auth : la grille iso occupe tout le fond, un voile central
// creuse la place du formulaire. Le fondu des bords est laissé au `mask` de la grille elle-même —
// un second gradient opaque par-dessus mangerait les amas avant qu'ils n'atteignent le bord.
//
// Le gradient est posé sur l'élément qui le porte : var(--background) se résout là où il est
// déclaré, donc l'écrire sur un ancêtre figerait la valeur et casserait le mode clair. Les rayons
// d'un radial-gradient se mesurent sur la largeur et la hauteur pleines, pas sur les demi-
// dimensions : 25%/38% couvre la colonne du formulaire et rien de plus.
const centerScrim =
    'radial-gradient(ellipse 30% 44% at 50% 50%, var(--background) 56%, color-mix(in oklab, var(--background) 55%, transparent) 82%, transparent 100%)'

// Le décor est un fond, et il se remarquait trop : un voile plein cadre le fait reculer derrière le
// formulaire, sans toucher aux couleurs de statut qui restent justes, seulement plus sourdes. Le
// plafond utile est ~80% : au-delà le plateau s'éteint, les Box perdent leur nom et il ne reste
// qu'une texture. Le voile est peint en var(--background) et non en noir, sinon en mode clair il
// salirait la page au lieu de l'effacer.
const veil = 'color-mix(in oklab, var(--background) 50%, transparent)'

// La dialog est bien plus étroite que la page, et le cadrage de la grille se mesure sur son
// conteneur : posée telle quelle, elle tasserait les quatre amas en tuiles illisibles. Elle est donc
// cadrée sur un plateau plus large que la dialog, centré, dont la dialog ne montre que le milieu :
// les amas sont rognés par les bords au lieu d'être rapetissés. Le voile central reste mesuré sur le
// plateau, il couvre ainsi la colonne du formulaire comme sur la page.
const DIALOG_STAGE_WIDTH = '64rem'

export function AuthScene({ variant = 'page' }: { variant?: 'page' | 'dialog' }) {
    // La scène est masquée sous sm (et la dialog y devient une bottom sheet vaul) : on ne monte
    // pas une grille animée pour la cacher en CSS.
    const isMobile = useResolvedIsMobile()
    if (isMobile !== false) return null

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: variant === 'dialog' ? DIALOG_STAGE_WIDTH : '100%' }}>
                <AuthStageBoard />
                <div className="absolute inset-0" style={{ background: veil }} />
                <div className="absolute inset-0" style={{ backgroundImage: centerScrim }} />
            </div>
        </div>
    )
}
