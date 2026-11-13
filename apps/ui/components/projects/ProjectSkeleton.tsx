import { PageFrame } from '@/components/layout/PageFrame'
import type { PageHeaderBack } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'

const CARDS_PER_COLUMN = [3, 2, 4, 1]

// The project page while it loads: its header with the tabs, and the columns of the board.
export function ProjectSkeleton({ back }: { back: PageHeaderBack }) {
    return (
        <PageFrame
            title={<Skeleton className="h-4 w-40" />}
            back={back}
            tabs={
                <div className="flex h-10 items-center gap-6 px-3">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="h-3.5 w-10" />
                    <Skeleton className="h-3.5 w-16" />
                </div>
            }
            bleed
        >
            <div className="flex h-full gap-3 overflow-hidden px-4 pt-12 md:px-6">
                {CARDS_PER_COLUMN.map((cards, column) => (
                    <div key={column} className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2 max-md:w-full max-md:[&:not(:first-child)]:hidden">
                        <Skeleton className="mx-0.5 mt-0.5 mb-1 h-4 w-20 rounded-full" />
                        {Array.from({ length: cards }, (_, card) => (
                            <Skeleton key={card} className="h-16 w-full rounded-md" />
                        ))}
                    </div>
                ))}
            </div>
        </PageFrame>
    )
}
