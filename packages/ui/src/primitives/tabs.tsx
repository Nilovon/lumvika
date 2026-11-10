'use client'

import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '../cn'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            className={cn('inline-flex h-10 w-fit items-center gap-1 text-muted-foreground', className)}
            {...props}
        />
    )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            className={cn(
                'relative inline-flex h-full shrink-0 items-center justify-center whitespace-nowrap px-3 text-sm font-medium transition-colors',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors',
                'hover:text-foreground focus-visible:z-10 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                'disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:after:bg-primary',
                className,
            )}
            {...props}
        />
    )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            data-slot="tabs-content"
            className={cn('outline-none data-[state=inactive]:hidden focus-visible:ring-2 focus-visible:ring-ring/50', className)}
            {...props}
        />
    )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
