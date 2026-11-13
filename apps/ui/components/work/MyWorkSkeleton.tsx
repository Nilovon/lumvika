import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const SECTIONS = [
    { title: 'w-20', rows: ['w-56', 'w-72', 'w-44'] },
    { title: 'w-12', rows: ['w-64', 'w-40'] },
]

// The sections of "My work" while they load: a title and its count, then rows shaped like IssueRow.
export function MyWorkSkeleton() {
    return (
        <div className="flex flex-col gap-5">
            {SECTIONS.map(section => (
                <div key={section.title} className="flex flex-col gap-2">
                    <Skeleton className={cn('mx-1 h-3', section.title)} />
                    <div className="overflow-hidden rounded-lg border border-border">
                        {section.rows.map(width => (
                            <div key={width} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                                <Skeleton className="size-4 shrink-0 max-sm:hidden" />
                                <Skeleton className="h-3 w-12 shrink-0 max-sm:hidden" />
                                <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Skeleton className="h-4 w-20 shrink-0 rounded-md" />
                                        <Skeleton className={cn('h-3.5 max-w-full', width)} />
                                    </span>
                                    <Skeleton className="h-3 w-32 sm:hidden" />
                                </span>
                                <Skeleton className="h-5 w-20 rounded-full max-sm:hidden" />
                                <Skeleton className="size-5 shrink-0 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
