'use client'

import { motion, useReducedMotion } from 'motion/react'
import { cn } from './cn'

/**
 * Text that writes itself in: each word fades up from a blur, one after the other, the way a model
 * streams a sentence. Renders inline spans only, so it can sit inside a heading without breaking it.
 *
 * It plays on mount, so remount it (a `key` on the parent) to replay it on a new sentence.
 */
export function TextGenerateEffect({
    text,
    className,
    /** Seconds each word takes to land. */
    duration = 0.5,
    /** Seconds between two words. */
    stagger = 0.09,
    /** Seconds before the first word, to let a container's own transition finish first. */
    delay = 0,
    /** Radius (px) each word is blurred by before it lands. */
    blur = 8,
}: {
    text: string
    className?: string
    duration?: number
    stagger?: number
    delay?: number
    blur?: number
}) {
    const reduceMotion = useReducedMotion() ?? false
    const words = text.split(' ')

    if (reduceMotion) return <span className={className}>{text}</span>

    return (
        <motion.span
            className={cn('inline', className)}
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        >
            {words.map((word, index) => (
                <span key={`${word}-${index}`}>
                    {/* The space stays outside the animated span: inside an inline-block it would
                        stop collapsing at a line break and stretch the last word of every line. */}
                    <motion.span
                        className="inline-block"
                        variants={{ hidden: { opacity: 0, filter: `blur(${blur}px)` }, visible: { opacity: 1, filter: 'blur(0px)' } }}
                        transition={{ duration, ease: 'easeOut' }}
                    >
                        {word}
                    </motion.span>
                    {index < words.length - 1 && ' '}
                </span>
            ))}
        </motion.span>
    )
}
