'use client'

import type { CoworkerCheckout } from '@/app/api/_services/work/overview.service'
import { OverviewCard } from '@/components/overview/OverviewCard'
import { COWORKER_STATE_TONES, coworkersNow } from '@/components/overview/coworker-states'
import { useBoardStore } from '@/stores/board.store'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useMemo } from 'react'

const SHOWN = 6

// Who is working (and on what), who waits on a person, who is idle or off, from the board's live
// statuses and the issues a coworker's run holds.
export function CoworkersNow({ checkouts }: { checkouts: CoworkerCheckout[] }) {
    const t = useTranslations('overview.coworkers')
    const agents = useBoardStore(state => state.agents)
    const now = useMemo(() => coworkersNow(agents, checkouts), [agents, checkouts])
    const shown = now.slice(0, SHOWN)

    return (
        <OverviewCard title={t('title')} link={{ href: '/', label: t('all') }}>
            {now.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {shown.map(({ agent, state, checkout }) => (
                        <li key={agent.id}>
                            <Link href={`/?agent=${encodeURIComponent(agent.id)}`} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60">
                                <AgentBuddy agentId={agent.id} size={28} mood={state === 'working' ? 'working' : 'idle'} animated={state === 'working'} facing="right" className="shrink-0" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-medium">{agent.name}</span>
                                    {checkout && (
                                        <span className="truncate text-xs text-muted-foreground" title={checkout.title}>
                                            {t('workingOn', { ref: checkout.ref, title: checkout.title })}
                                        </span>
                                    )}
                                </span>
                                <Badge size="xs" tone={COWORKER_STATE_TONES[state]} glow={false} className="shrink-0 font-medium">
                                    {t(`status.${state}`)}
                                </Badge>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {now.length > SHOWN && (
                <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    {t('more', { count: now.length - SHOWN })}
                </Link>
            )}
        </OverviewCard>
    )
}
