'use client'

import { Button } from '../primitives'
import { cn } from '../cn'
import type { ComponentProps } from 'react'

export type SuggestionsProps = ComponentProps<'div'>

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
    <div className={cn('flex w-full flex-wrap items-center gap-2', className)} {...props}>
        {children}
    </div>
)

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
    suggestion: string
    onClick?: (suggestion: string) => void
}

export const Suggestion = ({ suggestion, onClick, className, variant = 'outline', size = 'sm', children, ...props }: SuggestionProps) => (
    <Button className={cn('cursor-pointer rounded-full px-4', className)} onClick={() => onClick?.(suggestion)} size={size} type="button" variant={variant} {...props}>
        {children || suggestion}
    </Button>
)
