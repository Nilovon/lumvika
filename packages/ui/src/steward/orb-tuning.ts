import type { OrbActivity } from './Orb'

export type OrbTuning = {
    /** Multiplie les harmoniques du contour : plus c'est haut, plus la bille est molle. */
    amp: number
    /** Vitesse d'avancement du contour. */
    churn: number
    breathe: number
    breatheRate: number
    /** Opacité du halo extérieur. */
    bloom: number
    /** Amplitude du regard, en rayons d'oeil. */
    gaze: number
    /** Vitesse de balayage du regard. */
    gazeRate: number
    /** Ouverture au repos : < 1 = paupière plissée. */
    openness: number
    /** Délai moyen entre deux clignements, en secondes. */
    blinkEvery: number
    /** De combien la boule pivote sur elle-même en regardant autour d'elle, en degrés. */
    turn: number
    /** Vitesse de ce balayage. */
    turnRate: number
    /** Amplitude du hochement, en degrés. */
    nod: number
}

// Les quatre états ne changent jamais la forme ni les couleurs, seulement le rythme : c'est la même
// bête qui respire autrement. Un état qui changerait de teinte ferait quatre personnages.
export const ORB_TUNING: Record<OrbActivity, OrbTuning> = {
    idle: { amp: 1, churn: 0.5, breathe: 0.016, breatheRate: 0.55, bloom: 0.75, gaze: 0.8, gazeRate: 0.35, openness: 1, blinkEvery: 4.6, turn: 16, turnRate: 0.45, nod: 0 },
    listening: { amp: 1.25, churn: 0.95, breathe: 0.034, breatheRate: 1.1, bloom: 1, gaze: 1.5, gazeRate: 0.6, openness: 1.2, blinkEvery: 6.4, turn: 9, turnRate: 0.7, nod: 0 },
    thinking: { amp: 1.5, churn: 2.5, breathe: 0.013, breatheRate: 2.4, bloom: 0.92, gaze: 3, gazeRate: 1.9, openness: 0.74, blinkEvery: 2.1, turn: 40, turnRate: 1.6, nod: 0 },
    speaking: { amp: 1.35, churn: 1.45, breathe: 0.052, breatheRate: 3.1, bloom: 1.2, gaze: 1.1, gazeRate: 0.8, openness: 0.94, blinkEvery: 5.2, turn: 4, turnRate: 0.8, nod: 7 },
}

/**
 * Glisse les réglages courants vers ceux de l'état demandé, sur place. Un changement d'état sec
 * ferait sauter le contour d'une frame à l'autre ; ici la bête accélère.
 */
export function approachTuning(current: OrbTuning, target: OrbTuning, dt: number) {
    const k = 1 - Math.exp(-dt * 2.6)
    for (const key of Object.keys(current) as (keyof OrbTuning)[]) {
        current[key] += (target[key] - current[key]) * k
    }
}
