import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const TITLES = ['w-64', 'w-80', 'w-52']

// The review cards while the queue loads, shaped like ReviewItemCard.
export function ReviewSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            {TITLES.map(width => (
                <div key={width} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-20 rounded-md" />
                                <Skeleton className="h-3 w-12" />
                                <Skeleton className="size-3.5" />
                            </div>
                            <Skeleton className={cn('h-3.5 max-w-full', width)} />
                        </div>
                        <Skeleton className="h-3 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-4 rounded-full" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="flex flex-col gap-1.5 border-l-2 border-border pl-3">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3.5 w-full max-w-md" />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="h-8 w-24" />
                    </div>
                </div>
            ))}
        </div>
    )
}
