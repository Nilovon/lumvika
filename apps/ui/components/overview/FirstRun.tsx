'use client'

import { Button } from '@/components/ui/button'
import { KanbanIcon, TicketIcon, UserPlus } from '@/lib/icons'
import { useBuilderDialogsStore } from '@/stores/builder-dialogs.store'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType } from 'react'

type Step = { id: 'recruit' | 'project' | 'assign'; icon: ComponentType<{ className?: string }> }

const STEPS: Step[] = [
    { id: 'recruit', icon: UserPlus },
    { id: 'project', icon: KanbanIcon },
    { id: 'assign', icon: TicketIcon },
]

// A workspace with no project and no coworker yet: the three steps that make the overview worth a
// look, rather than a wall of zeros.
export function FirstRun() {
    const t = useTranslations('overview.firstRun')
    const router = useRouter()

    const recruit = () => {
        router.push('/')
        useBuilderDialogsStore.getState().openNewAgent()
    }

    return (
        <section aria-labelledby="overview-first-run" className="@container flex flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-8">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                <AgentBuddy agentId="overview-welcome" size={48} mood="idle" animated facing="right" className="shrink-0" />
                <div className="min-w-0">
                    <h2 id="overview-first-run" className="text-lg font-medium">
                        {t('title')}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t('description')}</p>
                </div>
            </div>
            <ol className="grid gap-3 @2xl:grid-cols-3">
                {STEPS.map(({ id, icon: Glyph }, index) => (
                    <li key={id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Glyph className="size-4" />
                            {t('step', { number: index + 1 })}
                        </span>
                        <span className="flex flex-1 flex-col gap-1">
                            <span className="text-sm font-medium">{t(`${id}.title`)}</span>
                            <span className="text-xs text-muted-foreground">{t(`${id}.description`)}</span>
                        </span>
                        {id === 'recruit' ? (
                            <Button type="button" size="sm" onClick={recruit} className="self-start">
                                {t('recruit.action')}
                            </Button>
                        ) : (
                            <Button asChild size="sm" variant="outline" className="self-start">
                                <Link href="/projects">{t(`${id}.action`)}</Link>
                            </Button>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    )
}
