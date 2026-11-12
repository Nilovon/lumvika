import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function CardSkeleton({ rows, className }: { rows: string[]; className?: string }) {
    return (
        <div className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', className)}>
            <div className="flex justify-between">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-16" />
            </div>
            {rows.map((width, index) => (
                <div key={`${width}-${index}`} className="flex items-center gap-3 py-1">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <Skeleton className={cn('h-3.5 max-w-full', width)} />
                    <Skeleton className="ml-auto h-4 w-14 rounded-full" />
                </div>
            ))}
        </div>
    )
}

// The overview while it loads: the strip of four numbers, then the two columns of cards.
export function OverviewSkeleton() {
    return (
        <div className="@container flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
                {['a', 'b', 'c', 'd'].map(key => (
                    <div key={key} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="my-1 h-6 w-8" />
                    </div>
                ))}
            </div>
            <div className="grid gap-4 @4xl:grid-cols-3">
                <div className="flex flex-col gap-4 @4xl:col-span-2">
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-48" />
                        <Skeleton className="h-44 w-full" />
                    </div>
                    <CardSkeleton rows={['w-40', 'w-56', 'w-32']} />
                </div>
                <div className="flex flex-col gap-4">
                    <CardSkeleton rows={['w-24', 'w-28', 'w-20', 'w-24']} />
                    <CardSkeleton rows={['w-32', 'w-40']} />
                </div>
            </div>
        </div>
    )
}
