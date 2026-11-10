// Où atterrit une Box sur la grille. Module pur, partagé par la server action qui crée la Box et
// par le board, qui doit pouvoir dessiner le fantôme au même endroit avant le clic.

import { CONTAINER_SIDES, containerFaceCenter, type ContainerSide } from '@/lib/board/iso'

export const SPACE_SIZE = 8
export const SPACE_GAP = 1

// Une face du losange d'une Box. Chacune regarde une direction de grille : 'top-right' → row
// décroissant, 'bottom-right' → col croissant, 'bottom-left' → row croissant, 'top-left' → col
// décroissant.
export type SpaceSide = ContainerSide

export type SpaceRect = { col_start: number; row_start: number; col_end: number; row_end: number }
export type NewSpaceRect = { colStart: number; rowStart: number; colEnd: number; rowEnd: number }

// Combien de Box par rangée avant de passer à la suivante. Une organisation de six divisions
// empilée en colonne devient, en iso, une diagonale de cinquante rangées : la caméra dézoome
// jusqu'à ce qu'aucune tuile ne se lise. Trois de front tiennent dans le cadre.
export const BOXES_PER_ROW = 3

const SPACE_PITCH = SPACE_SIZE + SPACE_GAP

// Assez de rangées pour n'importe quel board réel. Au-delà, c'est qu'une Box agrandie à la main
// occupe tout le treillis, et on retombe sur l'empilement, qui a toujours une réponse.
const MAX_SCANNED_ROWS = 64

// Le coin haut-gauche du treillis : celui du board existant, pas l'origine absolue. Une Box
// déplacée à la main emmène le treillis avec elle, au lieu de laisser la suivante atterrir à
// l'autre bout de la grille.
function latticeAnchor(spaces: SpaceRect[]): { col: number; row: number } {
    if (!spaces.length) return { col: 0, row: 0 }
    return {
        col: Math.min(...spaces.map(s => Math.min(s.col_start, s.col_end))),
        row: Math.min(...spaces.map(s => Math.min(s.row_start, s.row_end))),
    }
}

function stackBelow(spaces: SpaceRect[]): NewSpaceRect {
    const lowestRow = spaces.reduce((max, s) => Math.max(max, s.row_start, s.row_end), -1)
    const rowStart = lowestRow + 1 + (spaces.length === 0 ? 0 : SPACE_GAP)
    return { colStart: 0, rowStart, colEnd: SPACE_SIZE - 1, rowEnd: rowStart + SPACE_SIZE - 1 }
}

// La première place libre d'un treillis de BOXES_PER_ROW colonnes, lu de gauche à droite puis
// rangée par rangée. Une organisation créée d'un bloc se dessine donc en bloc, et un board déjà
// peuplé voit ses trous se remplir avant de s'étendre.
export function findFreeRect(spaces: SpaceRect[]): NewSpaceRect {
    const anchor = latticeAnchor(spaces)

    for (let row = 0; row < MAX_SCANNED_ROWS; row++) {
        for (let col = 0; col < BOXES_PER_ROW; col++) {
            const colStart = anchor.col + col * SPACE_PITCH
            const rowStart = anchor.row + row * SPACE_PITCH
            const rect = { colStart, rowStart, colEnd: colStart + SPACE_SIZE - 1, rowEnd: rowStart + SPACE_SIZE - 1 }
            if (!spaces.some(other => collides(rect, other))) return rect
        }
    }

    return stackBelow(spaces)
}

// Le candidat est gonflé de SPACE_GAP avant le test : deux Box qui se touchent sans se chevaucher
// ne sont pas une place libre, elles seraient collées.
function collides(a: NewSpaceRect, b: SpaceRect) {
    return a.colStart - SPACE_GAP <= Math.max(b.col_start, b.col_end) && Math.min(b.col_start, b.col_end) <= a.colEnd + SPACE_GAP && a.rowStart - SPACE_GAP <= Math.max(b.row_start, b.row_end) && Math.min(b.row_start, b.row_end) <= a.rowEnd + SPACE_GAP
}

const sameRect = (a: SpaceRect, b: SpaceRect) => a.col_start === b.col_start && a.col_end === b.col_end && a.row_start === b.row_start && a.row_end === b.row_end

// Rect d'une nouvelle Box collée à une face de `source` : taille par défaut, centrée sur le milieu
// de cette face et séparée d'elle par SPACE_GAP. C'est ce même milieu que porte la marque « + » du
// board (`containerFaceCenter`), donc le fantôme se lit centré sous la marque quelle que soit la
// taille de la source. `null` quand la place est déjà prise : la face n'offre alors aucun ajout,
// plutôt que d'envoyer la Box atterrir ailleurs sans rapport avec la face cliquée. La source est
// exclue du test, elle est adjacente par construction.
export function freeRectOnSide(source: SpaceRect, side: SpaceSide, existing: SpaceRect[]): NewSpaceRect | null {
    const colStart = Math.min(source.col_start, source.col_end)
    const colEnd = Math.max(source.col_start, source.col_end)
    const rowStart = Math.min(source.row_start, source.row_end)
    const rowEnd = Math.max(source.row_start, source.row_end)

    // SPACE_SIZE est pair : le centre du rect tombe sur une ligne de grille. Le milieu d'une face de
    // longueur impaire tombe, lui, sur un demi — on arrondit, à une demi-cellule près.
    const face = containerFaceCenter(source, side)
    const centered = (mid: number) => Math.round(mid) - SPACE_SIZE / 2

    // +1 pour sortir de la dernière cellule de la source, puis SPACE_GAP cellules de vide.
    const away = 1 + SPACE_GAP
    const rect = ((): NewSpaceRect => {
        switch (side) {
            case 'top-right': {
                const end = rowStart - away
                const start = centered(face.col)
                return { colStart: start, colEnd: start + SPACE_SIZE - 1, rowStart: end - (SPACE_SIZE - 1), rowEnd: end }
            }
            case 'bottom-left': {
                const start = rowEnd + away
                const col = centered(face.col)
                return { colStart: col, colEnd: col + SPACE_SIZE - 1, rowStart: start, rowEnd: start + SPACE_SIZE - 1 }
            }
            case 'bottom-right': {
                const start = colEnd + away
                const row = centered(face.row)
                return { colStart: start, colEnd: start + SPACE_SIZE - 1, rowStart: row, rowEnd: row + SPACE_SIZE - 1 }
            }
            case 'top-left': {
                const end = colStart - away
                const row = centered(face.row)
                return { colStart: end - (SPACE_SIZE - 1), colEnd: end, rowStart: row, rowEnd: row + SPACE_SIZE - 1 }
            }
        }
    })()

    return existing.some(other => !sameRect(other, source) && collides(rect, other)) ? null : rect
}

// Où atterrit une Box créée sans face de départ. Une organisation ne se lit pas comme un tableau de
// trois par rangée : elle a un cœur, la division où l'utilisateur passe sa semaine, et le reste se
// range autour de lui. La première Box se pose donc seule, les quatre suivantes contre les quatre
// faces de son losange, et celles d'après sur la face libre la plus proche du cœur, quelle que soit
// la Box qui la porte : l'entreprise s'épaissit en rosace au lieu de filer en diagonale. C'est le
// geste du « + » du board, joué tout seul.
//
// `spaces` arrive de la plus ancienne à la plus récente : le cœur est celle qui ouvre la liste.
export function findRadialRect(spaces: SpaceRect[]): NewSpaceRect {
    const heart = spaces[0]
    // Board vide : la toute première Box n'entoure rien, elle se pose à l'ancre du treillis.
    if (!heart) return findFreeRect(spaces)

    // Le centre du cœur, bornes désordonnées comprises : une Box dessinée vers le haut a un
    // col_end plus petit que son col_start. Celui d'un candidat, lui, sort toujours ordonné.
    const center = {
        col: (Math.min(heart.col_start, heart.col_end) + Math.max(heart.col_start, heart.col_end) + 1) / 2,
        row: (Math.min(heart.row_start, heart.row_end) + Math.max(heart.row_start, heart.row_end) + 1) / 2,
    }
    const distanceToHeart = (rect: NewSpaceRect) => ((rect.colStart + rect.colEnd + 1) / 2 - center.col) ** 2 + ((rect.rowStart + rect.rowEnd + 1) / 2 - center.row) ** 2

    let best: { rect: NewSpaceRect; distance: number } | null = null
    for (const source of spaces) {
        for (const side of CONTAINER_SIDES) {
            const rect = freeRectOnSide(source, side, spaces)
            if (!rect) continue
            const distance = distanceToHeart(rect)
            if (!best || distance < best.distance) best = { rect, distance }
        }
    }

    // Plus une face libre nulle part : un board dont les Box ont été agrandies jusqu'à se boucher
    // les unes les autres. Le treillis a toujours une place.
    return best?.rect ?? findFreeRect(spaces)
}

// Même chose, mais toujours une place : sert au chemin de création, où la place peut avoir été
// prise entre l'affichage du « + » et le clic. La Box s'empile alors en bas plutôt que d'échouer.
export function rectOnSide(source: SpaceRect, side: SpaceSide, existing: SpaceRect[]): NewSpaceRect {
    return freeRectOnSide(source, side, existing) ?? findFreeRect(existing)
}
