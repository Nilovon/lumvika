'use client'

import { useTranslations } from 'next-intl'

import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'

// `prefill` ones need the person to finish the sentence (a link to paste), so they go to the
// composer rather than straight to the assistant.
const SUGGESTIONS = [
    { key: 'draftEmail', prefill: false },
    { key: 'explain', prefill: false },
    { key: 'brainstorm', prefill: false },
    { key: 'summarize', prefill: true },
] as const

type AssistantEmptyStateProps = {
    onSend: (text: string) => void
    onPrefill: (text: string) => void
}

export function AssistantEmptyState({ onSend, onPrefill }: AssistantEmptyStateProps) {
    const t = useTranslations('assistant.empty')
    return (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-4 py-10">
            <div className="space-y-1.5">
                <h2 className="font-heading text-xl font-medium text-foreground @2xl:text-2xl">{t('title')}</h2>
                <p className="max-w-prose text-sm text-muted-foreground">{t('description')}</p>
            </div>
            <Suggestions>
                {SUGGESTIONS.map(({ key, prefill }) => (
                    <Suggestion key={key} suggestion={t(`suggestions.${key}.prompt`)} onClick={text => (prefill ? onPrefill(text) : onSend(text))} className="max-w-full">
                        <span className="truncate">{t(`suggestions.${key}.label`)}</span>
                    </Suggestion>
                ))}
            </Suggestions>
        </div>
    )
}
