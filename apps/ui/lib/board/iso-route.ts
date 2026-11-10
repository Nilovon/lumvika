import { DEFAULT_SPAN, TILE_H, TILE_W } from '@lumvika/ui/iso-grid/iso'

// Le tracé des liens, et les prédicats qui permettent de savoir ce qu'un tracé rencontre : de quoi
// choisir où poser une tuile en connaissant à l'avance le câble qu'elle va tirer.
//
// C'est une transcription du routage que `TileLinks` applique au rendu, côté app parce que le
// package reste tel quel. Les deux doivent donc rester d'accord : si `routeLink` change dans
// `packages/ui/src/iso-grid/components/TileLinks.tsx`, le placement d'ici raisonne sur un tracé qui
// n'est plus celui qu'on dessine, et les tests de `auth-stage-board.test.ts` ne le verront pas.

const HALF_W = TILE_W / 2
const HALF_H = TILE_H / 2

// Durée du branchement d'un câble qui porte un appearDelay.
export const CABLE_DRAW_MS = 420

// Coordonnées le long des deux axes iso : u suit l'axe « col », v l'axe « row ». Le centre d'une
// tile de footprint span ancrée en (col,row) tombe en (col + span/2, row + span/2), et son losange
// s'étend de span/2 de part et d'autre sur chaque axe. Une arête du losange est donc un u ou un v
// constant, et son milieu (le centre d'une face) est le point où un segment aligné sur l'autre axe
// la traverse.
export type TileAxis = { u: number; v: number; half: number }
export type AxisPoint = { u: number; v: number }

// Le paramètre est typé sur sa forme et non sur Tile : une cellule candidate, qui n'est pas encore
// une tuile, doit pouvoir être routée.
export type AxisTile = { position: { col: number; row: number }; span?: number }

export function tileAxis(tile: AxisTile): TileAxis {
    const span = tile.span ?? DEFAULT_SPAN
    return { u: tile.position.col + span / 2, v: tile.position.row + span / 2, half: span / 2 }
}

// Même convention d'écran que tileBox/ContainerBlock : isoPosition().left + TILE_W/2.
export function axisToWorld(point: AxisPoint, worldOffset: { left: number; top: number }) {
    return {
        x: (point.u - point.v) * HALF_W + HALF_W + worldOffset.left,
        y: (point.u + point.v) * HALF_H + worldOffset.top,
    }
}

// Tracé du câble entre deux tiles, en segments alignés sur les axes de la grille. Les extrémités
// sont posées au milieu d'une face (jamais vers un coin) : un segment ne peut servir de sortie que
// s'il est assez long pour franchir le losange de sa tile, sinon c'est l'autre segment qui perce
// le bloc, et il le fait hors du centre de face. On essaie donc le coude simple sur chaque axe,
// puis, si aucun des deux ne tient, un tracé en Z qui rentre perpendiculairement des deux côtés.
export function routeLink(source: TileAxis, target: TileAxis): AxisPoint[] {
    const du = target.u - source.u
    const dv = target.v - source.v
    const su = Math.sign(du) || 1
    const sv = Math.sign(dv) || 1

    if (Math.abs(du) >= source.half && Math.abs(dv) > target.half) {
        return [
            { u: source.u + su * source.half, v: source.v },
            { u: target.u, v: source.v },
            { u: target.u, v: target.v - sv * target.half },
        ]
    }

    if (Math.abs(dv) >= source.half && Math.abs(du) > target.half) {
        return [
            { u: source.u, v: source.v + sv * source.half },
            { u: source.u, v: target.v },
            { u: target.u - su * target.half, v: target.v },
        ]
    }

    if (Math.abs(du) >= source.half + target.half) {
        const from = source.u + su * source.half
        const to = target.u - su * target.half
        const mid = (from + to) / 2
        return [
            { u: from, v: source.v },
            { u: mid, v: source.v },
            { u: mid, v: target.v },
            { u: to, v: target.v },
        ]
    }

    if (Math.abs(dv) >= source.half + target.half) {
        const from = source.v + sv * source.half
        const to = target.v - sv * target.half
        const mid = (from + to) / 2
        return [
            { u: source.u, v: from },
            { u: source.u, v: mid },
            { u: target.u, v: mid },
            { u: target.u, v: to },
        ]
    }

    return [
        { u: source.u, v: source.v },
        { u: target.u, v: target.v },
    ]
}

export function dedupe(points: AxisPoint[]) {
    return points.filter((point, index) => index === 0 || point.u !== points[index - 1].u || point.v !== points[index - 1].v)
}

export function routeBetween(source: AxisTile, target: AxisTile): AxisPoint[] {
    return dedupe(routeLink(tileAxis(source), tileAxis(target)))
}

// ---------------------------------------------------------------------------
// Ce qu'un tracé rencontre
// ---------------------------------------------------------------------------
// Toute la géométrie se fait en (u,v) et jamais en pixels : axisToWorld est affine, donc elle
// préserve les intersections, mais elle introduirait du bruit flottant. En (u,v) les coordonnées
// d'une route sont des multiples de 1/4 (span et half valent 1/2 ou 1, le mid d'un Z divise par
// deux), donc des dyadiques exacts en float64 : les tests d'orientation sont des égalités vraies,
// et un epsilon n'aurait aucun sens.

const cross = (a: AxisPoint, b: AxisPoint, c: AxisPoint) => (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u)

const samePoint = (a: AxisPoint, b: AxisPoint) => a.u === b.u && a.v === b.v

// Combiné à cross(a,b,p) === 0, c'est « p appartient au segment [a,b] », extrémités comprises.
const withinBounds = (a: AxisPoint, b: AxisPoint, p: AxisPoint) =>
    Math.min(a.u, b.u) <= p.u && p.u <= Math.max(a.u, b.u) && Math.min(a.v, b.v) <= p.v && p.v <= Math.max(a.v, b.v)

// 'proper' : les deux segments se traversent en un point intérieur aux deux. 'contact' : ils se
// touchent ou se recouvrent, et les points de contact sont alors forcément des extrémités
// d'entrée, donc exacts. Le point d'un croisement propre n'est jamais calculé : il demanderait une
// division, et aucun appelant n'en a besoin.
export type SegmentHit = { kind: 'none' } | { kind: 'proper' } | { kind: 'contact'; points: AxisPoint[] }

export function segmentHit(a0: AxisPoint, a1: AxisPoint, b0: AxisPoint, b1: AxisPoint): SegmentHit {
    const d0 = cross(b0, b1, a0)
    const d1 = cross(b0, b1, a1)
    const d2 = cross(a0, a1, b0)
    const d3 = cross(a0, a1, b1)

    if (((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) && ((d2 > 0 && d3 < 0) || (d2 < 0 && d3 > 0))) return { kind: 'proper' }

    const points: AxisPoint[] = []
    if (d0 === 0 && withinBounds(b0, b1, a0)) points.push(a0)
    if (d1 === 0 && withinBounds(b0, b1, a1)) points.push(a1)
    if (d2 === 0 && withinBounds(a0, a1, b0)) points.push(b0)
    if (d3 === 0 && withinBounds(a0, a1, b1)) points.push(b1)

    return points.length > 0 ? { kind: 'contact', points } : { kind: 'none' }
}

// Une route et l'identité de la tuile dont elle part, pour reconnaître un faisceau.
export type AxisRoute = { points: AxisPoint[]; sourceId: string }

// Le tronc : la portion de départ que deux routes issues de la même tuile parcourent ensemble.
// routeLink pose toujours son premier point au milieu d'une face, donc deux câbles qui sortent du
// même côté partagent leur ancre et se superposent jusqu'à ce que le second bifurque. C'est une
// fourche, pas un croisement, et l'interdire rendrait le placement infaisable dès qu'un agent a
// deux outils du même côté.
type Trunk = { origin: AxisPoint; du: number; dv: number; length: number }

function trunkOf(a: AxisRoute, b: AxisRoute): Trunk | null {
    if (a.sourceId !== b.sourceId) return null
    if (a.points.length < 2 || b.points.length < 2) return null
    if (!samePoint(a.points[0], b.points[0])) return null

    const origin = a.points[0]
    const pa = { u: a.points[1].u - origin.u, v: a.points[1].v - origin.v }
    const pb = { u: b.points[1].u - origin.u, v: b.points[1].v - origin.v }
    // Les segments de route sont alignés sur un axe : la longueur Manhattan est la longueur, et la
    // direction unitaire a ses composantes dans {0, ±1}, donc elle reste exacte.
    const la = Math.abs(pa.u) + Math.abs(pa.v)
    const lb = Math.abs(pb.u) + Math.abs(pb.v)
    if (la === 0 || lb === 0) return null

    // Deux sorties par des faces différentes : pas de tronc, seule l'ancre commune est tolérée.
    const sameDirection = pa.u * pb.v - pa.v * pb.u === 0 && pa.u * pb.u + pa.v * pb.v > 0
    return { origin, du: pa.u / la, dv: pa.v / la, length: sameDirection ? Math.min(la, lb) : 0 }
}

function onTrunk(point: AxisPoint, trunk: Trunk) {
    const du = point.u - trunk.origin.u
    const dv = point.v - trunk.origin.v
    const along = du * trunk.du + dv * trunk.dv
    return du * trunk.dv - dv * trunk.du === 0 && along >= 0 && along <= trunk.length
}

export function routesCross(a: AxisRoute, b: AxisRoute): boolean {
    const trunk = trunkOf(a, b)

    for (let i = 0; i + 1 < a.points.length; i++) {
        for (let j = 0; j + 1 < b.points.length; j++) {
            const hit = segmentHit(a.points[i], a.points[i + 1], b.points[j], b.points[j + 1])
            if (hit.kind === 'none') continue
            // Un croisement transversal ne peut pas tomber sur le tronc : deux segments y sont
            // colinéaires, donc jamais transversaux.
            if (hit.kind === 'proper') return true
            if (trunk && hit.points.every(point => onTrunk(point, trunk))) continue
            return true
        }
    }

    return false
}

// L'empreinte d'une tuile en (u,v) : un carré aligné sur les axes, qui se projette exactement sur
// son losange à l'écran.
export type AxisBox = { u0: number; v0: number; u1: number; v1: number }

export function tileAxisBox(tile: AxisTile): AxisBox {
    const span = tile.span ?? DEFAULT_SPAN
    return { u0: tile.position.col, v0: tile.position.row, u1: tile.position.col + span, v1: tile.position.row + span }
}

// Liang-Barsky : le clip paramétrique gère les segments parallèles à une bande sans division par
// zéro, ce qui est le cas courant ici puisque toute route est alignée sur un axe. `margin` dilate
// le carré ; à 0 même raser une arête compte, puisqu'un câble posé sur l'arête d'un losange
// disparaît sous la silhouette du bloc, qui est peinte au-dessus des liens.
export function segmentHitsBox(a: AxisPoint, b: AxisPoint, box: AxisBox, margin = 0): boolean {
    const u0 = box.u0 - margin
    const u1 = box.u1 + margin
    const v0 = box.v0 - margin
    const v1 = box.v1 + margin
    const du = b.u - a.u
    const dv = b.v - a.v
    let t0 = 0
    let t1 = 1

    const clip = (p: number, q: number) => {
        if (p === 0) return q >= 0
        const r = q / p
        if (p < 0) {
            if (r > t1) return false
            if (r > t0) t0 = r
        } else {
            if (r < t0) return false
            if (r < t1) t1 = r
        }
        return true
    }

    return clip(-du, a.u - u0) && clip(du, u1 - a.u) && clip(-dv, a.v - v0) && clip(dv, v1 - a.v) && t0 <= t1
}

export function routeHitsBox(points: AxisPoint[], box: AxisBox, margin = 0): boolean {
    for (let i = 0; i + 1 < points.length; i++) {
        if (segmentHitsBox(points[i], points[i + 1], box, margin)) return true
    }
    return false
}
