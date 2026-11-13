import { cn } from '@/lib/utils'

// The place of a name, or of the sentence that carries one, while the people and coworkers of the
// workspace are still being read. A span, so it sits inside a line of text.
export function NameSkeleton({ className }: { className?: string }) {
    return <span aria-hidden data-slot="skeleton" className={cn('inline-block h-3 w-16 animate-pulse rounded-md bg-accent align-middle', className)} />
}
