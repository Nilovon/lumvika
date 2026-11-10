'use client'

import { IsoGrid } from '@rerun/ui/iso-grid'

import { useAuthStage } from './useAuthStage'

// Le décor plein cadre des surfaces d'auth. Il ne décide de rien : la scène vient de useAuthStage,
// et ce composant ne fait que la cadrer.
//
// La scène est un fond, pas un spectacle, mais elle doit vivre : on la regarde en remplissant un
// formulaire, et ce qu'on doit y lire c'est une équipe au travail. Une tuile porte donc le statut
// de son agent avec les couleurs du produit, sans les adoucir : ambre quand il travaille, cyan et
// main levée quand il attend un feu vert, rouge le temps qu'il se reprenne, bleu au repos. Une
// version antérieure gardait le bleu partout et ne comptait que sur les liens ; le plateau avait
// l'air éteint en permanence.
//
// Ce n'est pas une guirlande pour autant, et c'est le scénario qui le tient : à tout instant deux
// ou trois agents sur dix sont allumés, jamais tout le plateau, et un statut dure assez longtemps
// pour être lu avant de changer.

// Le cadrage est mesuré (fitToContent) : aucun zoom fixe ne peut remplir à la fois un 1440x900 et
// un 1920x1080. Le plafond tient les très grands écrans, où plus rien ne borne le zoom : il est posé
// au-dessus du zoom desktop par défaut du produit pour qu'ils dégagent le centre autant que les
// autres, et pas pour grossir les tuiles.
const MAX_ZOOM = 2

// Un décor n'a pas à tenir en entier : à l'échelle qui fait rentrer les quatre amas dans le
// viewport, les tuiles sont trop petites pour qu'on lise ce qui s'y passe, et les amas viennent
// serrer la colonne du formulaire. On mesure donc le cadrage sur un cadre plus grand que le
// viewport : la grille tient dedans, ce sont les bords qui débordent, et chaque amas s'éloigne du
// centre à proportion. Le cadre est agrandi plutôt que la grille mise à l'échelle en CSS : c'est un
// vrai zoom, donc des tuiles nettes, et pan/clamp restent cohérents avec ce qui est peint.
//
// Ce que l'overscan coûte, ce sont les extrémités des amas, coupées par le bord du viewport là où le
// masque les a déjà fondues.
const OVERSCAN = 1.27
const FRAME_INSET = `${((1 - OVERSCAN) / 2) * 100}%`

// Plein cadre : on ne fond que le bord, là où la vignette par défaut couperait en plein dans les
// amas. Les rayons sont écrits en fraction du cadre débordant, donc divisés par l'overscan pour
// retomber au même endroit à l'écran. Une ellipse creuse les coins bien plus vite que les bords, et
// les quatre amas sont précisément dans les coins : elle est ouverte jusqu'à déborder du viewport,
// sinon elle les efface avant que le cadrage ne les coupe.
const MASK = `radial-gradient(ellipse ${(72 / OVERSCAN).toFixed(1)}% ${(74 / OVERSCAN).toFixed(1)}% at 50% 50%, black 78%, transparent 100%)`

export function AuthStageBoard() {
    const { stage, tiles, links } = useAuthStage()

    return (
        <div className="absolute" style={{ inset: FRAME_INSET }}>
            <IsoGrid
                tiles={tiles}
                containers={stage.containers}
                liveLinks={links}
                // Rien n'est sélectionnable sur un décor : le halo de sélection s'y lirait comme un
                // artefact d'UI.
                selectedTileId={null}
                worldAnchor={{ left: '50%', top: '50%' }}
                fitToContent
                initialZoomDesktop={MAX_ZOOM}
                initialZoomMobile={MAX_ZOOM}
                mask={MASK}
                scrollGestures={false}
            />
        </div>
    )
}
