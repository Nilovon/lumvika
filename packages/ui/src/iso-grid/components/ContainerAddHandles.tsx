'use client'

import { memo, useMemo } from 'react'
import { TILE_H, TILE_W, containerFaceCenter, isoPosition, tileZ } from '../iso'
import type { Container, ContainerSide } from '../types'

// Zone cliquable d'une cellule, transparente : elle déborde la marque, on ne vise pas un glyphe de
// 20px.
const HIT_W = TILE_W
const HIT_H = TILE_H

// Tout ce qui suit est exprimé en cellules et projeté par `isoPosition` : une forme décrite dans
// ce repère se pose dans le plan du sol, sans transform CSS. Un rotateX ne ferait qu'écraser
// verticalement, sans donner aux deux barres du « + » leur raccourci respectif.
//
// Les angles sont arrondis dans ce même repère : un rayon en cellules, une quadratique dont le
// coin est le point de contrôle. La projection étant affine, l'arrondi projeté est exactement
// celui du sol — un `stroke-linejoin: round` l'aurait, lui, arrondi dans le plan de l'écran.
function floorPath(corners: [number, number][], radius: number) {
    const cut = (from: [number, number], to: [number, number]): [number, number] => {
        const dx = to[0] - from[0]
        const dy = to[1] - from[1]
        const len = Math.hypot(dx, dy)
        // Jamais plus de la moitié d'une arête, sinon deux coins voisins se marcheraient dessus.
        const k = Math.min(radius, len / 2) / len
        return [from[0] + dx * k, from[1] + dy * k]
    }
    const at = ([u, v]: [number, number]) => {
        const p = isoPosition(u, v)
        return `${p.left.toFixed(2)},${p.top.toFixed(2)}`
    }

    const n = corners.length
    let d = ''
    for (let i = 0; i < n; i++) {
        const cur = corners[i]
        const enter = cut(cur, corners[(i - 1 + n) % n])
        const exit = cut(cur, corners[(i + 1) % n])
        d += `${i === 0 ? 'M' : 'L'} ${at(enter)} Q ${at(cur)} ${at(exit)} `
    }

    const points = corners.map(([u, v]) => isoPosition(u, v))
    return {
        d: `${d}Z`,
        halfW: Math.max(...points.map(p => Math.abs(p.left))),
        halfH: Math.max(...points.map(p => Math.abs(p.top))),
    }
}

// Cercle décrit lui aussi dans le repère du sol : la projection étant affine, ses quatre cubiques
// deviennent exactement l'ellipse du cercle couché, sans passer par un rx/ry calculé à la main.
const CIRCLE_KAPPA = 0.5522847498307936

function floorCircle(radius: number) {
    const k = radius * CIRCLE_KAPPA
    const at = (u: number, v: number) => {
        const p = isoPosition(u, v)
        return `${p.left.toFixed(2)},${p.top.toFixed(2)}`
    }

    const d =
        `M ${at(radius, 0)} ` +
        `C ${at(radius, k)} ${at(k, radius)} ${at(0, radius)} ` +
        `C ${at(-k, radius)} ${at(-radius, k)} ${at(-radius, 0)} ` +
        `C ${at(-radius, -k)} ${at(-k, -radius)} ${at(0, -radius)} ` +
        `C ${at(k, -radius)} ${at(radius, -k)} ${at(radius, 0)} Z`

    // Les extrêmes de l'ellipse tombent sur les diagonales du sol.
    const diag = radius * Math.SQRT1_2
    return { d, halfW: isoPosition(diag, -diag).left, halfH: isoPosition(diag, diag).top }
}

// « + » aligné sur les axes de la grille, comme tout ce qui est couché dans la scène. Le rayon
// dépasse la demi-épaisseur des barres, donc leurs bouts ressortent complètement arrondis.
const PLUS_ARM = 0.17
const PLUS_THICKNESS = 0.024
const PLUS_RADIUS = 0.021

// La plaque : un disque du sol, donc une ellipse à l'écran, qui porte le fond et la bordure. Son
// rayon n'est pas un nombre magique, c'est le bras du « + » plus son padding.
const PLATE_PADDING = 0.105

const MARK = (() => {
    const plate = floorCircle(PLUS_ARM + PLATE_PADDING)

    const a = PLUS_ARM
    const t = PLUS_THICKNESS
    const plus = floorPath(
        [
            [-t, -a],
            [t, -a],
            [t, -t],
            [a, -t],
            [a, t],
            [t, t],
            [t, a],
            [-t, a],
            [-t, t],
            [-a, t],
            [-a, -t],
            [-t, -t],
        ],
        PLUS_RADIUS
    )

    // Marge pour la bordure, sinon elle se fait rogner par le viewBox.
    const pad = 2
    return { plate: plate.d, plus: plus.d, width: 2 * plate.halfW + pad, height: 2 * plate.halfH + pad }
})()

// Écart entre la face du container et le centre de la marque, en cellules : la marque se pose
// dans la toute première cellule libre, presque contre la face. Le demi met l'axe perpendiculaire
// à la face pile sur un centre de cellule.
const FACE_GAP = 0.5

// Ancre de la marque pour chaque face : le milieu de l'arête, poussé de FACE_GAP cellules dehors.
// La marque reste sur l'axe exact de la face, quitte à ce qu'une ligne de grille passe dessous :
// c'est cet axe que la Box voisine vient prendre pour centre, les deux ne se lisent alignés que
// s'ils partagent le même milieu.
function anchorForSide(container: Container, side: ContainerSide) {
    const face = containerFaceCenter(container, side)

    switch (side) {
        case 'top-right':
            return { col: face.col, row: face.row - FACE_GAP }
        case 'bottom-right':
            return { col: face.col + FACE_GAP, row: face.row }
        case 'bottom-left':
            return { col: face.col, row: face.row + FACE_GAP }
        case 'top-left':
            return { col: face.col - FACE_GAP, row: face.row }
    }
}

type ContainerAddHandlesProps = {
    container: Container
    // Les faces qui acceptent un voisin. L'hôte possède la règle de placement : une face sans
    // place ne porte pas de marque du tout.
    sides: readonly ContainerSide[]
    worldOffset: { left: number; top: number }
    label: string
    activeSide: ContainerSide | null
    // L'id du container est renvoyé par le composant pour que l'hôte garde des callbacks stables,
    // partagés par tous les containers.
    onAdd: (containerId: string, side: ContainerSide) => void
    onSideHover: (containerId: string, side: ContainerSide | null) => void
}

export const ContainerAddHandles = memo(function ContainerAddHandles({ container, sides, worldOffset, label, activeSide, onAdd, onSideHover }: ContainerAddHandlesProps) {
    const spots = useMemo(
        () =>
            sides.map(side => {
                const anchor = anchorForSide(container, side)
                const p = isoPosition(anchor.col, anchor.row)
                return {
                    side,
                    // isoPosition rend le coin nord de la cellule : on recentre la zone de clic dessus.
                    left: p.left + worldOffset.left + TILE_W / 2 - HIT_W / 2,
                    top: p.top + worldOffset.top - HIT_H / 2,
                    // La marque est un décalque de sol : elle se trie en profondeur comme un bloc
                    // d'une cellule, sinon elle se peint par-dessus le relief des tiles voisines.
                    // Une tile est dessinée `blockHeight` px plus haut que le sol, sa silhouette
                    // mord donc sur la cellule d'à côté — au nord-ouest, c'est celle de la marque.
                    z: tileZ(anchor.col, anchor.row),
                }
            }),
        [container, sides, worldOffset]
    )

    return (
        <>
            {spots.map(({ side, left, top, z }, i) => (
                <button
                    key={side}
                    type="button"
                    aria-label={label}
                    title={label}
                    className="iso-add-mark absolute flex cursor-pointer items-center justify-center focus-visible:outline-none"
                    data-active={activeSide === side ? '' : undefined}
                    style={{ left, top, width: HIT_W, height: HIT_H, zIndex: z, animationDelay: `${i * 35}ms`, pointerEvents: 'auto' }}
                    // Le hit-test racine de l'IsoGrid démarrerait un pan sous le « + » : il est hors du
                    // container, donc sur le vide.
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                        e.stopPropagation()
                        onAdd(container.id, side)
                    }}
                    onPointerEnter={() => onSideHover(container.id, side)}
                    onPointerLeave={() => onSideHover(container.id, null)}
                    onFocus={() => onSideHover(container.id, side)}
                    onBlur={() => onSideHover(container.id, null)}
                >
                    <svg className="iso-add-mark-glyph" width={MARK.width} height={MARK.height} viewBox={`${-MARK.width / 2} ${-MARK.height / 2} ${MARK.width} ${MARK.height}`} aria-hidden>
                        <path className="iso-add-mark-plate" d={MARK.plate} />
                        <path className="iso-add-mark-plus" d={MARK.plus} />
                    </svg>
                </button>
            ))}
        </>
    )
})
