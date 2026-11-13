import { DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslations } from 'next-intl'

// The dialog's own layout while the issue loads: header, properties column and the main column.
export function IssueDetailSkeleton() {
    const t = useTranslations('issues.detail')
    return (
        <>
            <DialogTitle className="sr-only">{t('loading')}</DialogTitle>
            <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-2/3" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="grid grid-cols-2 gap-3 border-border px-4 py-4 max-md:order-first max-md:border-b md:grid-cols-1 md:border-l">
                    {['w-12', 'w-14', 'w-16', 'w-14', 'w-12'].map((width, index) => (
                        <div key={index} className="flex flex-col gap-1.5">
                            <Skeleton className={`h-3 ${width}`} />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-6 px-4 py-4 md:order-first">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-5/6" />
                        <Skeleton className="h-3.5 w-2/3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        </>
    )
}
