'use client'

import { cn } from '@/lib/utils'
import type { ReasoningEffort } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

type ReasoningEffortPickerProps = {
    levels: readonly ReasoningEffort[]
    value: ReasoningEffort | undefined
    onChange: (effort: ReasoningEffort | undefined) => void
}

const AUTO = 'auto'

// Sits at the top of the model popover, only for a model that takes an effort. "Auto" sends none,
// which leaves the provider's own default in charge.
export function ReasoningEffortPicker({ levels, value, onChange }: ReasoningEffortPickerProps) {
    const t = useTranslations('agent.modelSelector.effort')
    const options = [{ value: AUTO, short: t('auto'), full: t('autoDescription') }, ...levels.map(level => ({ value: level, short: t(`${level}Short`), full: t(level) }))]
    const current = value ?? AUTO

    return (
        <div className="border-b px-2 pt-2 pb-2.5">
            <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">{t('title')}</p>
            <div role="radiogroup" aria-label={t('title')} className="flex gap-0.5 rounded-md bg-muted p-0.5">
                {options.map(option => {
                    const checked = current === option.value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            aria-label={option.full}
                            title={option.full}
                            onClick={() => onChange(option.value === AUTO ? undefined : (option.value as ReasoningEffort))}
                            className={cn(
                                'h-7 min-w-0 flex-1 truncate rounded-[5px] px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                checked && 'bg-background text-foreground shadow-sm'
                            )}
                        >
                            {option.short}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
