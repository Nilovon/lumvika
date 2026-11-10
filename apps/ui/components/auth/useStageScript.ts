'use client'

import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import type { StageFrame, StageScript, StageStatus } from './auth-stage-board'

// Le lecteur du décor d'auth. Il ne décide de rien : auth-stage-board a déjà compilé le scénario en
// images datées, ce hook les rejoue et boucle. C'est ce qui distingue ce décor de la version
// précédente, où chaque agent tirait son prochain statut au sort — on voyait bien des tuiles
// changer, mais rien de suivable : un agent s'allumait sans raison pendant que son voisin
// s'éteignait. Un scénario écrit se lit comme une équipe qui travaille.
//
// Deux règles tiennent la lecture, et toutes deux viennent de l'onglet en arrière-plan.
//
// Le lecteur n'avance jamais en cumulant des délais : il lit l'heure du scénario et en déduit
// l'image entière. Un setTimeout étiré ne décale donc rien, et une image en retard ne rejoue pas
// les précédentes une par une — c'est ce rattrapage-là qui faisait clignoter tout le plateau d'un
// coup au retour sur l'onglet.
//
// Et l'heure du scénario n'est pas celle de la montre : elle s'arrête avec l'onglet et repart où
// elle en était. Un décor sert à être regardé ; celui qui a tourné dans le vide pendant dix minutes
// n'a rien à raconter du temps qu'on n'était pas là, et le reprendre en place évite le saut
// d'image qu'une resynchronisation sur l'heure réelle imposerait.

export type StagePlayback = {
    statuses: Record<string, StageStatus>
    // Les liens allumés par chaque agent, vide quand il ne travaille pas. Indexé par agent et non
    // global : plusieurs échanges ont lieu en même temps, et un agent en pleine collaboration tient
    // à la fois l'appel vers son outil et le beam vers son binôme.
    hotLinks: Record<string, string[]>
}

const RESTING: StagePlayback = { statuses: {}, hotLinks: {} }

// L'image du décor à un instant donné du scénario, compté depuis son premier battement. Une image
// n'est qu'un delta : le statut d'un agent est celui que la dernière image l'ayant touché lui a
// donné. Passé le premier tour, le cycle précédent compte donc aussi, d'où la passe complète avant
// le préfixe — le cycle étant rejoué à l'identique, un seul tour suffit à porter tout le passé.
export function stagePlaybackAt(script: StageScript, time: number): StagePlayback {
    if (script.frames.length === 0 || time < 0) return RESTING

    const statuses: Record<string, StageStatus> = {}
    const hotLinks: Record<string, string[]> = {}

    const apply = (frame: StageFrame) => {
        for (const change of frame.changes) {
            if (change.status !== undefined) statuses[change.agent] = change.status
            if (change.links !== undefined) hotLinks[change.agent] = change.links
        }
    }

    const phase = time % script.period
    if (time >= script.period) for (const frame of script.frames) apply(frame)
    for (const frame of script.frames) {
        if (frame.at > phase) break
        apply(frame)
    }

    return { statuses, hotLinks }
}

// Le temps qui reste avant la prochaine image, donc le seul réveil qui vaut la peine d'être posé.
export function msToNextFrame(script: StageScript, time: number): number {
    const first = script.frames[0]
    if (!first) return script.period
    if (time < 0) return first.at - time

    const phase = time % script.period
    const next = script.frames.find(frame => frame.at > phase)
    return next ? next.at - phase : script.period - phase + first.at
}

function sameLinks(a: string[] | undefined, b: string[] | undefined) {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    return a.every((link, index) => link === b[index])
}

// Deux images identiques ne valent qu'un rendu : l'onglet qui revient sur la même seconde du
// scénario ne doit pas remonter les liens du plateau pour rien.
function samePlayback(a: StagePlayback, b: StagePlayback) {
    const agents = new Set([...Object.keys(a.statuses), ...Object.keys(b.statuses), ...Object.keys(a.hotLinks), ...Object.keys(b.hotLinks)])
    for (const agent of agents) {
        if (a.statuses[agent] !== b.statuses[agent]) return false
        if (!sameLinks(a.hotLinks[agent], b.hotLinks[agent])) return false
    }
    return true
}

export function useStageScript({ script, enabled }: { script: StageScript; enabled: boolean }): StagePlayback {
    const [playback, setPlayback] = useState<StagePlayback>(RESTING)
    const reducedMotion = useReducedMotion() ?? false

    const running = enabled && !reducedMotion && script.frames.length > 0

    useEffect(() => {
        if (!running) return

        // Le décor finit d'atterrir avant que le scénario ne commence : l'heure part en négatif.
        let played = -script.startAt
        let resumedAt = Date.now()
        let paused = document.visibilityState === 'hidden'
        let timer: ReturnType<typeof setTimeout> | undefined

        const scriptTime = () => (paused ? played : played + (Date.now() - resumedAt))

        const play = () => {
            const time = scriptTime()
            const next = stagePlaybackAt(script, time)
            setPlayback(previous => (samePlayback(previous, next) ? previous : next))
            timer = setTimeout(play, Math.max(16, msToNextFrame(script, time)))
        }

        const onVisibility = () => {
            const hidden = document.visibilityState === 'hidden'
            if (hidden === paused) return
            if (hidden) {
                played = played + (Date.now() - resumedAt)
                paused = true
                clearTimeout(timer)
                return
            }
            paused = false
            resumedAt = Date.now()
            play()
        }

        if (!paused) play()
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [running, script])

    // Le décor au repos est rendu sans passer par un setState : l'état gardé ici n'est que la
    // dernière image jouée, il n'a pas à être remis à zéro pour être ignoré.
    return running ? playback : RESTING
}
