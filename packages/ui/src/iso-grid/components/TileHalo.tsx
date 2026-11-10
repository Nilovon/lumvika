'use client'

// Mise en avant d'une tuile : quatre murs de lumière dressés sur les quatre arêtes de son
// empreinte, comme quatre planches plantées autour d'elle, la tuile enfermée dedans.
//
// Chaque mur est un rectangle de hauteur constante, penché par le même skewY que les faces d'un
// bloc (l'arête d'un losange iso monte ou descend d'une demi-hauteur sur une demi-largeur, soit
// atan(0.5) = 26.565°). Le dégradé reste vertical à l'écran après le skew, donc chaque planche
// s'éteint depuis sa propre base sans qu'on ait à la calculer par colonne.
//
// Les murs se rendent en DEUX passes, et c'est tout l'enjeu : les deux planches du fond sortent
// au-dessus de la tuile, les deux planches de devant sont exactement là où la tuile est peinte. En
// une seule passe sous le bloc, ces deux-là disparaissent et la boîte semble ouverte par l'avant.

// Hauteur des planches, en fraction de la profondeur du losange à l'écran. Sous 1 la boîte s'ouvre :
// les quatre planches ne se rejoignent plus au sommet nord et un losange de fond apparaît au milieu.
const HEIGHT = 'var(--iso-halo-wall, 1.2)'
const PERIOD = 'var(--iso-halo-period, 2000ms)'
const SKEW = 26.565

export type HaloSide = 'back' | 'front'

// Les quatre arêtes, nommées par les deux pointes qu'elles relient, avec l'ancre de leur planche :
// `y` est la hauteur de la pointe de départ sur le losange (0 = pointe nord, 0.5 = est/ouest,
// 1 = pointe sud), la planche étant tirée vers le haut depuis cette arête.
const WALLS = [
    { key: 'north-west', side: 'back', x: 0, y: 0.5, skew: -SKEW, tone: 1 },
    { key: 'north-east', side: 'back', x: 0.5, y: 0, skew: SKEW, tone: 0.85 },
    { key: 'south-west', side: 'front', x: 0, y: 0.5, skew: SKEW, tone: 0.9 },
    { key: 'south-east', side: 'front', x: 0.5, y: 1, skew: -SKEW, tone: 0.72 },
] as const satisfies readonly { key: string; side: HaloSide; x: number; y: number; skew: number; tone: number }[]

// Le réglage de chaque planche est un seul nombre, `intensité x tone` : l'intensité vient du board,
// le `tone` distingue les quatre faces (celles de devant se vident plus tôt, elles couvrent la tuile
// peinte). Il est écrit en deux morceaux parce qu'il se lit de deux façons de part et d'autre de 1.
//
// Au-dessus de 1, le pied est à couleur pleine et la planche reste pleine sur `1 - 1/k` de sa
// hauteur avant d'entamer sa descente. En dessous, il n'y a plus de palier et c'est le pied lui-même
// qui est dilué. Dans les deux cas les DEUX BOUTS ne bougent jamais : couleur au ras du sol, zéro
// pile au sommet de la planche. Le réglage remplit le mur, il ne le rallonge ni ne le raccourcit,
// et seul `--iso-halo-wall` décide de sa taille.
const INTENSITY = 'var(--iso-halo-intensity, 0.5)'

const body = (color: string, tone: number) => {
    const sole = `color-mix(in srgb, ${color} min(100%, calc(100% * ${INTENSITY} * ${tone})), transparent)`
    const plateau = `max(0%, calc(100% - 100% / ${INTENSITY} / ${tone}))`
    return `linear-gradient(to top, ${sole} 0%, ${sole} ${plateau}, transparent 100%)`
}

export function TileHalo({ side, width, height, depth, offsetTop = 0, color, phase, reducedMotion }: { side: HaloSide; width: number; height: number; depth: number; offsetTop?: number; color: string; phase: number; reducedMotion?: boolean }) {
    // Déphasage exprimé en fraction de période : une rangée de tuiles allumées qui respirent au même
    // métronome se lit comme une guirlande. Les deux passes partagent la même valeur, donc les
    // quatre planches d'une tuile respirent ensemble.
    const breathe = reducedMotion
        ? { opacity: 0.9 }
        : { animation: `iso-tile-halo ${PERIOD} ease-in-out infinite`, animationDelay: `calc(${PERIOD} * ${-phase.toFixed(3)})` }

    return (
        <div
            // Seules les planches de devant se mélangent, et le mode dépend du thème (`.iso-halo-front`
            // dans styles.css). Le bloc est un contexte d'empilement, le mélange s'y arrête.
            className={side === 'front' ? 'absolute inset-0 pointer-events-none iso-halo-front' : 'absolute inset-0 pointer-events-none'}
            style={offsetTop ? { top: offsetTop } : undefined}
        >
            <div className="absolute inset-0" style={breathe}>
                {WALLS.filter(wall => wall.side === side).map(wall => (
                    <div
                        key={wall.key}
                        className="absolute"
                        style={{
                            left: width * wall.x,
                            // La planche est tirée depuis l'arête de la face SUPÉRIEURE, pas depuis
                            // celle du sol, et rallongée vers le bas de l'épaisseur du bloc pour
                            // retomber quand même sur le sol. Prise depuis le sol, elle manquerait
                            // le haut de la tuile de cette même épaisseur et laisserait un losange
                            // éteint au sommet nord, la boîte percée en son milieu.
                            top: `calc(${height * wall.y}px - ${height}px * ${HEIGHT})`,
                            width: width / 2,
                            height: `calc(${height}px * ${HEIGHT} + ${depth}px)`,
                            transform: `skewY(${wall.skew}deg)`,
                            transformOrigin: 'top left',
                            background: body(color, wall.tone),
                        }}
                    />
                ))}
            </div>
        </div>
    )
}
