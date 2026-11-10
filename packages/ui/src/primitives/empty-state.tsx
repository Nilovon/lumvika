import type { ComponentType, ReactNode } from 'react'
import { cn } from '../cn'
import { Icon } from './icon'

interface EmptyStateProps {
    icon: ComponentType<{ className?: string }>
    title: string
    description?: string
    action?: ReactNode
    className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center', className)}>
            <Icon icon={icon} size="xl" />
            <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{title}</p>
                {description && <p className="text-xs text-muted-foreground max-w-[36ch]">{description}</p>}
            </div>
            {action}
        </div>
    )
}
