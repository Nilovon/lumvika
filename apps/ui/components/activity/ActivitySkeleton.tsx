import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const DAYS = [
    { label: 'w-16', lines: ['w-72', 'w-96', 'w-60', 'w-80'] },
    { label: 'w-24', lines: ['w-64', 'w-88'] },
]

// The feed while it loads: a day header, then lines shaped like ActivityEventItem.
export function ActivitySkeleton() {
    return (
        <div className="flex flex-col gap-6">
            {DAYS.map(day => (
                <div key={day.label} className="flex flex-col gap-1">
                    <Skeleton className={cn('h-3', day.label)} />
                    <ul className="divide-y divide-border/60">
                        {day.lines.map(width => (
                            <li key={width} className="flex items-start gap-3 py-2.5">
                                <Skeleton className="size-5 shrink-0 rounded-full" />
                                <Skeleton className={cn('h-3.5 max-w-full min-w-0 flex-1 sm:flex-none', width)} />
                                <Skeleton className="ml-auto h-3 w-10 shrink-0" />
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}
