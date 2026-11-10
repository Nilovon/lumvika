'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const WIKILINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g

function Inline({ text }: { text: string }) {
    const parts: ReactNode[] = []
    let cursor = 0
    for (const match of text.matchAll(WIKILINK)) {
        if (match.index > cursor) parts.push(text.slice(cursor, match.index))
        parts.push(
            <span key={match.index} className="font-medium underline decoration-current/30 underline-offset-2">
                {match[2]?.trim() || match[1]}
            </span>
        )
        cursor = match.index + match[0].length
    }
    if (cursor < text.length) parts.push(text.slice(cursor))
    return <>{parts}</>
}

type LineShape = { kind: 'heading' | 'bullet' | 'text'; text: string }

function shapeOf(line: string): LineShape {
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) return { kind: 'heading', text: heading[1] }
    const bullet = /^\s*-\s+(.*)$/.exec(line)
    if (bullet) return { kind: 'bullet', text: bullet[1] }
    return { kind: 'text', text: line }
}

function Block({ shape, children, className }: { shape: LineShape['kind']; children: ReactNode; className?: string }) {
    if (shape === 'heading') return <h3 className={cn('pt-3 text-[13px] font-semibold text-foreground first:pt-0', className)}>{children}</h3>
    if (shape === 'bullet')
        return (
            <div className={cn('flex gap-2 text-sm leading-relaxed', className)}>
                <span className="mt-[9px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="min-w-0 flex-1">{children}</span>
            </div>
        )
    return <p className={cn('text-sm leading-relaxed', className)}>{children}</p>
}

export function Prose({ markdown, className }: { markdown: string; className?: string }) {
    const lines = markdown.split('\n').filter(line => line.trim() && !/^\s*-\s*$/.test(line))
    return (
        <div className={cn('space-y-1', className)}>
            {lines.map((line, index) => {
                const shape = shapeOf(line)
                return (
                    <Block key={index} shape={shape.kind}>
                        <Inline text={shape.text} />
                    </Block>
                )
            })}
        </div>
    )
}
