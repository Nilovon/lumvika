'use client'

import { motion, type MotionValue } from 'motion/react'

export function RewindProgress({ count, index, progress }: { count: number; index: number; progress: MotionValue<number> }) {
    return (
        <div className="flex gap-1" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                    <motion.div
                        className="h-full origin-left rounded-full bg-white"
                        style={{ scaleX: i === index ? progress : i < index ? 1 : 0 }}
                    />
                </div>
            ))}
        </div>
    )
}
