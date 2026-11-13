import { PROJECT_GRID } from '@/components/projects/ProjectListRow'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const NAME_WIDTHS = ['w-40', 'w-56', 'w-32', 'w-48']

export function ProjectsSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <div className="overflow-hidden rounded-lg border border-border">
                <div className={cn('hidden border-b border-border px-3 py-2', PROJECT_GRID)}>
                    <Skeleton className="ml-16.5 h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="ml-auto h-3 w-12" />
                </div>
                {NAME_WIDTHS.map(width => (
                    <div key={width} className={cn('flex flex-col gap-2.5 border-b border-border px-3 py-3 last:border-b-0', PROJECT_GRID)}>
                        <div className="flex items-center gap-2.5">
                            <Skeleton className="h-3 w-10 shrink-0" />
                            <span className="ml-4 flex flex-col gap-1.5">
                                <Skeleton className={cn('h-3.5', width)} />
                                <Skeleton className="h-3 w-24" />
                            </span>
                        </div>
                        <div className="flex items-center gap-3 pl-16.5 md:contents">
                            <Skeleton className="h-4 w-14 rounded-full" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-3 w-14 md:ml-auto" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
