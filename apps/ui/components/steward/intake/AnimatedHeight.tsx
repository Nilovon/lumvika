'use client'

import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Le cadre des questions n'a pas la même hauteur à chaque étape : la liste des industries fait cinq
// fois celle d'un champ de prénom. Sans ça le pied de la colonne se redimensionne d'une image à
// l'autre, et tout ce qui est posé au-dessus (l'orbe, la question) saute d'autant.
//
// La hauteur est mesurée plutôt que laissée à `height: auto` : `auto` n'est pas une valeur qu'on
// peut interpoler, et `layout` de motion projette le contenu pendant la transition, ce qui étire le
// texte de l'étape qui arrive. Ici seul le conteneur bouge, son contenu est net du début à la fin.

const HEIGHT_TRANSITION = { duration: 0.28, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }

export function AnimatedHeight({ children, className }: { children: ReactNode; className?: string }) {
    const inner = useRef<HTMLDivElement>(null)
    // `null` tant que rien n'a été mesuré : la première hauteur est celle du contenu, pas une
    // animation depuis zéro.
    const [height, setHeight] = useState<number | null>(null)

    useLayoutEffect(() => {
        const element = inner.current
        if (!element) return
        const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
        observer.observe(element)
        setHeight(element.offsetHeight)
        return () => observer.disconnect()
    }, [])

    // Le clip déborde de 4px de chaque côté (marge négative rendue en padding) : sans ça le ring de
    // focus d'un champ pleine largeur et le hover d'une ligne en -mx-1 sont coupés net. Le parent
    // espace ses enfants en `gap`, pas en `space-y`, qui passe par la marge que `-m-1` écrase.
    return (
        <motion.div animate={height === null ? undefined : { height }} initial={false} transition={HEIGHT_TRANSITION} className={cn('-m-1', className)} style={{ overflow: 'hidden' }}>
            <div ref={inner} className="p-1">
                {children}
            </div>
        </motion.div>
    )
}
