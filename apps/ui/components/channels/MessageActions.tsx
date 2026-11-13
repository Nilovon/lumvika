'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EllipsisIcon, MessageSquareIcon, PencilIcon, Trash2Icon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type MessageActionsProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onReply?: () => void
    onEdit?: () => void
    onDelete?: () => void
}

// What a message offers: answer in its thread, and for its author (or a manager) edit and delete.
// A pointer finds them on hover; a finger by pressing the message, which opens the same menu.
export function MessageActions({ open, onOpenChange, onReply, onEdit, onDelete }: MessageActionsProps) {
    const t = useTranslations('channels.message')
    if (!onReply && !onEdit && !onDelete) return null

    return (
        <div
            className={cn(
                'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-sm transition-opacity',
                open ? 'opacity-100' : 'pointer-events-none opacity-0 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 [@media(hover:hover)]:group-hover/message:pointer-events-auto [@media(hover:hover)]:group-hover/message:opacity-100'
            )}
        >
            {onReply && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('reply')} onClick={onReply}>
                            <MessageSquareIcon />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('reply')}</TooltipContent>
                </Tooltip>
            )}
            <DropdownMenu open={open} onOpenChange={onOpenChange}>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={t('more')}>
                        <EllipsisIcon />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto">
                    {onReply && (
                        <DropdownMenuItem onSelect={onReply} className="whitespace-nowrap">
                            <MessageSquareIcon /> {t('reply')}
                        </DropdownMenuItem>
                    )}
                    {onEdit && (
                        <DropdownMenuItem onSelect={onEdit} className="whitespace-nowrap">
                            <PencilIcon /> {t('edit')}
                        </DropdownMenuItem>
                    )}
                    {onDelete && (
                        <DropdownMenuItem variant="destructive" onSelect={onDelete} className="whitespace-nowrap">
                            <Trash2Icon /> {t('delete')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE_PX = 8

// Opens the actions after a finger rests on the message; a scroll or a lift before then cancels it.
export function useLongPress(onLongPress: () => void) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const origin = useRef<{ x: number; y: number } | null>(null)
    const cancel = () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        origin.current = null
    }
    useEffect(() => cancel, [])
    return {
        onPointerDown: (event: PointerEvent) => {
            if (event.pointerType !== 'touch') return
            cancel()
            origin.current = { x: event.clientX, y: event.clientY }
            timer.current = setTimeout(onLongPress, LONG_PRESS_MS)
        },
        onPointerMove: (event: PointerEvent) => {
            if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > MOVE_TOLERANCE_PX) cancel()
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onContextMenu: (event: MouseEvent) => {
            if (!window.matchMedia('(hover: none)').matches) return
            event.preventDefault()
            onLongPress()
        },
    }
}
