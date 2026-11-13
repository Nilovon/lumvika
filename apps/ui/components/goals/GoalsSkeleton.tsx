import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PANEL_CARD } from '@lumvika/ui/primitives'

const ROWS = [
    { depth: 0, title: 'w-56' },
    { depth: 1, title: 'w-44' },
    { depth: 1, title: 'w-52' },
    { depth: 0, title: 'w-40' },
]

// The goal list as it lands: the filter pills, then cards nested the way a tree of goals is.
export function GoalsSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Skeleton className="h-9 w-20 rounded-lg" />
                <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
            <div className="space-y-2">
                {ROWS.map((row, index) => (
                    <div key={index} className={cn(row.depth > 0 && 'ml-3 border-l border-border pl-3 sm:ml-4 sm:pl-4')}>
                        <div className={cn(PANEL_CARD, 'flex flex-col gap-2.5 p-3 sm:p-4')}>
                            <div className="flex items-center gap-2 pl-7.5">
                                <Skeleton className={cn('h-3.5 max-w-[60%]', row.title)} />
                                <Skeleton className="h-4 w-14 rounded-full" />
                            </div>
                            <div className="flex gap-4 pl-7.5">
                                <Skeleton className="h-3 w-24" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                            <div className="flex items-center gap-2 pl-7.5">
                                <Skeleton className="h-1 flex-1 rounded-full" />
                                <Skeleton className="h-3 w-28" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
