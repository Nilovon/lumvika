import { cn } from '../cn'

// A step that walks sub steps of its own is shown inside its segment rather than on a second bar:
// the segment keeps the width of one step and is divided by the number of sub steps.
export type StepperSplit = { index: number; count: number; current: number }

// Consecutive steps that answer the same question are gathered under one caption. Grouping only
// adds the caption: the gap between two segments of a group is the gap between two groups, so what
// separates them is the label, not the spacing.
export type StepperGroup = { label: string; count: number }

const GAP_PX = 6

export function StepperBar({ count, current, className, split, groups }: { count: number; current: number; className?: string; split?: StepperSplit; groups?: readonly StepperGroup[] }) {
    if (!groups?.length) {
        return (
            <div className={cn('flex gap-1.5', className)}>
                {Array.from({ length: count }, (_, i) => (
                    <Step key={i} index={i} current={current} split={split} />
                ))}
            </div>
        )
    }

    let offset = 0

    return (
        <div className={cn('flex gap-1.5', className)}>
            {groups.map(group => {
                const start = offset
                offset += group.count
                return (
                    // Growing by the number of steps is not enough to keep every segment the same
                    // width as on an ungrouped bar: a group also has to pay for its own inner gaps
                    // up front, which is what the basis does. Without it the segments of a wide
                    // group come out narrower than those of a lone one.
                    <div
                        key={group.label}
                        className="flex min-w-0 flex-col gap-2.5"
                        style={{ flexGrow: group.count, flexBasis: `${(group.count - 1) * GAP_PX}px` }}
                    >
                        <span className={cn('truncate text-xs font-medium transition-colors', current >= start && current < start + group.count ? 'text-foreground' : 'text-muted-foreground')}>{group.label}</span>
                        <div className="flex gap-1.5">
                            {Array.from({ length: group.count }, (_, i) => (
                                <Step key={i} index={start + i} current={current} split={split} />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function Step({ index, current, split }: { index: number; current: number; split?: StepperSplit }) {
    if (split?.index !== index) return <Segment filled={index <= current} current={index === current} />

    return (
        <div className="flex flex-1 gap-1.5">
            {Array.from({ length: split.count }, (_, j) => (
                <Segment key={j} filled={index < current || (index === current && j <= split.current)} current={index === current && j === split.current} />
            ))}
        </div>
    )
}

// The segment being walked is hatched, the way a progress bar marks the part still in progress.
function Segment({ filled, current }: { filled: boolean; current: boolean }) {
    return <div className={cn('h-1 flex-1 rounded-full transition-colors', filled ? 'bg-foreground' : 'bg-foreground/15', current && 'stepper-stripes')} />
}
