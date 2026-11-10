import type { ReactNode } from 'react'
import { cn } from '../cn'

const ARROW = 'M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z'

// The arrow and its name pill, with no positioning of their own: whoever renders a cursor owns the
// box it sits in. `align` says which way the pill grows, so a cursor near the right edge does not
// push its name out of the frame. A role opts into the taller teammate badge; callers that only
// carry a name keep the compact live-cursor mark byte for byte.
//
// What rides in the pill is a photo (`photoUrl`) for a person, or anything drawn (`avatar`) for an
// agent, whose face is an SVG and not a picture. A mark with an avatar and no name is legitimate:
// the face already says who is driving.
export function CursorMark({
    name,
    role,
    color,
    photoUrl,
    avatar,
    align = 'right',
}: {
    name?: string
    role?: string
    color: string
    photoUrl?: string | null
    avatar?: ReactNode
    align?: 'right' | 'left'
}) {
    // `max-w-none`: the pill's containing block is the 20px arrow, so its shrink-to-fit width is its
    // min-content width, and Safari counts an image under preflight's `max-width: 100%` as 0px
    // there. The pill came out a photo too narrow and the end of the name spilled off it.
    const leading = avatar ?? (photoUrl ? <img src={photoUrl} alt="" width={role ? 40 : 32} height={role ? 40 : 32} decoding="async" className={cn('max-w-none shrink-0 rounded-full object-cover ring-1 ring-white/30', role ? 'size-5' : 'size-4')} /> : null)

    return (
        <>
            <svg width={20} height={20} viewBox="0 0 40 40" style={{ display: 'block' }}>
                <path fill={color} stroke="var(--background)" strokeWidth={2} d={ARROW} />
            </svg>
            <div
                className={cn(
                    'absolute top-4 flex items-center rounded-md text-white whitespace-nowrap shadow',
                    !role && 'text-xs font-medium',
                    align === 'left' ? 'right-4 flex-row-reverse' : 'left-4',
                    role ? (leading ? 'gap-1.5 py-1' : 'px-2 py-1') : leading ? 'gap-1.5 py-0.5' : 'px-2 py-0.5',
                    leading && (role ? (align === 'left' ? 'pr-1 pl-2' : 'pr-2 pl-1') : align === 'left' ? 'pr-0.5 pl-2' : 'pr-2 pl-0.5'),
                    leading && !name && !role && (align === 'left' ? 'pr-0.5 pl-0.5' : 'pr-0.5 pl-0.5'),
                )}
                style={{ backgroundColor: color }}
            >
                {leading}
                {role ? (
                    <span className={cn('flex flex-col leading-none', align === 'left' && 'items-end')}>
                        <span className="text-xs font-semibold leading-[1.05]">{name}</span>
                        <span className="mt-0.5 text-[9px] leading-[1.05] font-normal text-white/70">{role}</span>
                    </span>
                ) : (
                    name
                )}
            </div>
        </>
    )
}
