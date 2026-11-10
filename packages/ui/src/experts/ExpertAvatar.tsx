import { cn } from '../cn'

const GRADIENT_FROM = '#3f3f46'
const GRADIENT_TO = '#18181b'

export function ExpertAvatar({
    initials,
    src,
    alt,
    className,
    rounded = 'rounded-2xl',
}: {
    initials: string
    src?: string | null
    alt?: string
    className?: string
    rounded?: string
}) {
    if (src) {
        return <img src={src} alt={alt ?? initials} className={cn('object-cover', rounded, className)} />
    }

    return (
        <div
            className={cn('flex items-center justify-center font-heading font-semibold text-white/90', rounded, className)}
            style={{ backgroundImage: `linear-gradient(140deg, ${GRADIENT_FROM}, ${GRADIENT_TO})` }}
        >
            {initials}
        </div>
    )
}
