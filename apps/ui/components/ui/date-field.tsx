'use client'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, XIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { Calendar, calendarLocaleDe, calendarLocaleEn } from '@lumvika/ui/forms'
import { longDate } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

export type DateFieldProps = {
    id?: string
    // A calendar day, `2026-11-12`, as the database stores a due or target date. Null when unset.
    value: string | null
    onChange: (value: string | null) => void
    disabled?: boolean
    className?: string
}

function dayOf(value: string): Date {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

function valueOf(day: Date): string {
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

// A calendar day picked from the kit's calendar, written and read in the app's language rather than
// the browser's. Titled by the `Field` around it.
export function DateField({ id, value, onChange, disabled, className }: DateFieldProps) {
    const t = useTranslations('common.dateField')
    const locale = useLocale()
    const [open, setOpen] = useState(false)
    const selected = value ? dayOf(value) : undefined

    return (
        <div className={cn('relative', className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button id={id} type="button" variant="outline" disabled={disabled} className={cn('h-8 w-full justify-start gap-2 px-2.5 font-normal', value && 'pr-8', !value && 'text-muted-foreground')}>
                        <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{selected ? longDate(selected, locale) : t('placeholder')}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                    <Calendar
                        mode="single"
                        selected={selected}
                        defaultMonth={selected}
                        locale={locale.startsWith('de') ? calendarLocaleDe : calendarLocaleEn}
                        onSelect={day => {
                            onChange(day ? valueOf(day) : null)
                            setOpen(false)
                        }}
                    />
                </PopoverContent>
            </Popover>
            {value && !disabled && (
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(null)} aria-label={t('clear')} title={t('clear')} className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground">
                    <XIcon />
                </Button>
            )}
        </div>
    )
}
