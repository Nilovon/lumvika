'use client'

import type { ComponentType, ReactNode } from 'react'
import { cn } from '../cn'
import { Card } from '../primitives/card'
import { Icon } from '../primitives/icon'

type MonitorCardProps = {
    title: string
    subtitle?: string
    icon?: ComponentType<{ className?: string }>
    action?: ReactNode
    headerClassName?: string
    hideHeader?: boolean
    className?: string
    children: ReactNode
}

export function MonitorCard({ title, subtitle, icon: HeaderIcon, action, headerClassName, hideHeader = false, className, children }: MonitorCardProps) {
    return (
        <Card size="sm" className={cn('h-full w-full ring-border p-0 gap-0 data-[size=sm]:gap-0 data-[size=sm]:py-0', className)}>
            <div className={cn('flex items-center gap-2 border-b border-border px-3 pt-3 pb-2', headerClassName, hideHeader && 'hidden')}>
                {HeaderIcon && <Icon size="sm" icon={HeaderIcon} />}
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate leading-tight">{title}</div>
                    {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            <div className="flex w-full flex-1 min-h-0 flex-col overflow-hidden px-2 py-2">{children}</div>
        </Card>
    )
}
