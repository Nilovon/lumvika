'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentStatus } from '../presets'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

// Fait battre un board en lecture seule. Un ordonnanceur PAR AGENT, pas un pour tout le board : un
// battement global ferait bouger les agents à tour de rôle, ce qui se lit comme une rotation. Ici
// chacun tire son propre statut et sa propre durée de séjour, donc les changements se chevauchent
// et le board donne l'impression que plusieurs agents travaillent en parallèle.

// L'erreur et l'extinction sont exclues : le board sert à donner envie du template, pas à annoncer
// qu'il tombe en panne.
type LivingStatus = Extract<AgentStatus, 'working' | 'waiting_human' | 'idle'>

// Le premier battement d'un agent tombe après qu'il s'est posé, jamais pendant sa chute.
const WAKE_AFTER_LANDING = 250
const WAKE_SPREAD = 600

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

// Tirage pondéré : le board doit surtout montrer des agents qui bossent. `waiting_human` reste rare
// (c'est un appel à l'aide, pas un état de croisière) et `idle` n'est qu'une respiration entre deux
// tâches. Un `working → working` n'est pas un sur-place : il re-tire le câble chaud de l'agent, ce
// qui raconte qu'il est passé à un autre outil sans faire clignoter la couleur de la tuile.
function nextStatus(current: LivingStatus): LivingStatus {
    const roll = Math.random()
    if (current === 'idle') return roll < 0.8 ? 'working' : 'waiting_human'
    if (current === 'waiting_human') return 'working'
    if (roll < 0.45) return 'working'
    return roll < 0.8 ? 'idle' : 'waiting_human'
}

// Tiré à chaque transition plutôt que fixé par statut : deux agents ne restent jamais en phase.
function dwell(status: LivingStatus, repeated: boolean) {
    if (status === 'idle') return rand(700, 1_800)
    if (status === 'waiting_human') return rand(1_400, 2_600)
    return repeated ? rand(900, 1_800) : rand(2_200, 4_200)
}

type LivingBoard = {
    statuses: Record<string, LivingStatus>
    // Le câble en courant de chaque agent, null quand il ne travaille pas. Indexé par agent et non
    // global : plusieurs courants circulent en même temps.
    hotLinks: Record<string, string | null>
}

const RESTING: LivingBoard = { statuses: {}, hotLinks: {} }

export function useLivingBoard({
    agentKeys,
    linkIdsByAgent,
    startDelays,
    enabled,
    paused,
}: {
    agentKeys: string[]
    linkIdsByAgent: Map<string, string[]>
    // Quand chaque agent se pose (ms depuis le montage), pour qu'il ne s'anime pas en l'air.
    startDelays: Map<string, number>
    enabled: boolean
    // Board que personne ne voit : les battements s'arrêtent mais l'état reste, et la reprise repart
    // des statuts figés au lieu de refaire tomber le board.
    paused: boolean
}): LivingBoard {
    const [board, setBoard] = useState<LivingBoard>(RESTING)
    const boardRef = useRef(board)
    boardRef.current = board
    const reducedMotion = usePrefersReducedMotion()

    // Ces entrées changent d'identité à chaque rendu du parent alors que leur contenu est figé pour
    // la durée du board : les lire par ref évite de relancer les ordonnanceurs à chaque battement.
    const agentKeysRef = useRef(agentKeys)
    const linksRef = useRef(linkIdsByAgent)
    const startDelaysRef = useRef(startDelays)
    agentKeysRef.current = agentKeys
    linksRef.current = linkIdsByAgent
    startDelaysRef.current = startDelays

    const running = enabled && !reducedMotion && agentKeys.length > 0
    // Sérialisé, sinon la liste change d'identité à chaque rendu et l'effet se relancerait en boucle.
    const keys = agentKeys.join(',')

    useEffect(() => {
        if (!running) {
            setBoard(RESTING)
            return
        }
        if (paused) return

        // Un seul timer en attente par agent, remplacé à chaque battement.
        const timers = new Map<string, ReturnType<typeof setTimeout>>()

        const beat = (key: string, current: LivingStatus) => {
            const status = nextStatus(current)
            const links = status === 'working' ? (linksRef.current.get(key) ?? []) : []
            setBoard(previous => ({
                statuses: { ...previous.statuses, [key]: status },
                hotLinks: { ...previous.hotLinks, [key]: links.length > 0 ? pick(links) : null },
            }))
            timers.set(key, setTimeout(() => beat(key, status), dwell(status, status === current)))
        }

        for (const key of agentKeysRef.current) {
            const frozen = boardRef.current.statuses[key]
            if (frozen) {
                timers.set(key, setTimeout(() => beat(key, frozen), dwell(frozen, false)))
                continue
            }
            const wake = (startDelaysRef.current.get(key) ?? 0) + WAKE_AFTER_LANDING + Math.random() * WAKE_SPREAD
            timers.set(key, setTimeout(() => beat(key, 'idle'), wake))
        }

        return () => {
            for (const timer of timers.values()) clearTimeout(timer)
        }
    }, [running, paused, keys])

    return running ? board : RESTING
}
