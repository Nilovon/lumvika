'use client'

import type { ComponentProps, ComponentType, ReactNode, SVGProps } from 'react'
import { BorderBeam } from '../BorderBeam'
import { TooltipDisabledReason } from '../Tooltip'
import { cn } from '../cn'

/** `--chrome-size` in px, for the few places that animate to it in JS. */
export const CHROME_SIZE = 40

// Un bloc tient son élément de bord à la même distance du côté que du haut : un avatar de 24px
// dans une coque de 40 est à 8px des deux, un glyphe de 16 à 12, un contrôle de 32 à 4. Le texte,
// qui n'a pas de boîte à centrer, se cale à 16. Chaque valeur compte la bordure de 1px.
export type ChromeInset = 'control' | 'avatar' | 'gauge' | 'icon' | 'text'

const INSET_START: Record<ChromeInset, string> = {
    control: 'pl-[3px]',
    avatar: 'pl-[7px]',
    gauge: 'pl-[9px]',
    icon: 'pl-[11px]',
    text: 'pl-[15px]',
}

const INSET_END: Record<ChromeInset, string> = {
    control: 'pr-[3px]',
    avatar: 'pr-[7px]',
    gauge: 'pr-[9px]',
    icon: 'pr-[11px]',
    text: 'pr-[15px]',
}

// Floating over the board is the one real elevation in the app, hence the only large shadow.
const SURFACE = 'relative rounded-xl border border-border bg-card text-sm font-medium text-foreground shadow-lg'

type ChromeBeamProps = { beamTone?: 'white' | 'brand'; beamAnimated?: boolean }

function ChromeBeam({ beamTone = 'white', beamAnimated = false }: ChromeBeamProps) {
    return <BorderBeam pattern="arcs" tone={beamTone} animated={beamAnimated} angle={53} outset={1} className={beamTone === 'brand' ? 'opacity-50' : 'opacity-30'} />
}

export type ChromePillProps = ComponentProps<'button'> & ChromeBeamProps & { start?: ChromeInset; end?: ChromeInset }

/** A block that is its own control: the whole surface is the button. */
export function ChromePill({ start = 'text', end = 'text', beamTone, beamAnimated, className, children, ...props }: ChromePillProps) {
    return (
        <button
            type="button"
            className={cn(SURFACE, 'flex h-(--chrome-size) shrink-0 items-center gap-2 transition-colors hover:bg-accent', INSET_START[start], INSET_END[end], className)}
            {...props}
        >
            <ChromeBeam beamTone={beamTone} beamAnimated={beamAnimated} />
            {children}
        </button>
    )
}

export type ChromeBarProps = ComponentProps<'div'> & ChromeBeamProps & { orientation?: 'horizontal' | 'vertical'; start?: ChromeInset; end?: ChromeInset }

/** A block that holds controls or a status line. Vertical, it is one control wide. */
export function ChromeBar({ orientation = 'horizontal', start = 'control', end = 'control', beamTone, beamAnimated, className, children, ...props }: ChromeBarProps) {
    return (
        <div
            className={cn(
                SURFACE,
                'flex items-center',
                orientation === 'horizontal' ? ['h-(--chrome-size) gap-2', INSET_START[start], INSET_END[end]] : 'w-(--chrome-size) flex-col gap-1 py-[3px]',
                className
            )}
            {...props}
        >
            <ChromeBeam beamTone={beamTone} beamAnimated={beamAnimated} />
            {children}
        </div>
    )
}

export type ChromeButtonProps = ComponentProps<'button'> & {
    icon?: ComponentType<SVGProps<SVGSVGElement>>
    label?: ReactNode
    disabledReason?: string | null
}

/** A control inside a `ChromeBar`: an icon button, or a labelled one. */
export function ChromeButton({ icon: Icon, label, disabledReason, disabled, className, children, ...props }: ChromeButtonProps) {
    const labelled = label !== undefined || children !== undefined
    return (
        <TooltipDisabledReason reason={disabledReason ?? undefined} side="top" className="rounded-lg">
            <button
                type="button"
                disabled={disabled || !!disabledReason}
                className={cn(
                    'relative flex h-(--chrome-control) shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-50',
                    labelled ? 'px-3' : 'w-(--chrome-control)',
                    className
                )}
                {...props}
            >
                {Icon && <Icon className="size-4 shrink-0" />}
                {label}
                {children}
            </button>
        </TooltipDisabledReason>
    )
}

export function ChromeDivider({ orientation = 'vertical', className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
    return <div aria-hidden className={cn('shrink-0 bg-border', orientation === 'vertical' ? 'h-4 w-px' : 'h-px w-4', className)} />
}
