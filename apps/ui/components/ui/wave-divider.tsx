import { useId } from 'react'

export function WaveDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Wave />
            <span className="shrink-0">{label}</span>
            <Wave />
        </div>
    )
}

function Wave() {
    const id = useId()
    return (
        <svg aria-hidden className="h-1.5 min-w-0 flex-1 text-muted-foreground/50">
            <defs>
                <pattern id={id} width="12" height="6" patternUnits="userSpaceOnUse">
                    <path d="M0 3 Q3 0.5 6 3 T12 3" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
            </defs>
            <rect width="100%" height="6" fill={`url(#${id})`} />
        </svg>
    )
}
