'use client'

import { setCoworkerReportingAction } from '@/app/api/_actions/org-chart.actions'
import type { OrgCoworker } from '@/components/teams/org/org-coworker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { useCanManageAgent } from '@/hooks/useBoxAccess'
import { useErrorText } from '@/hooks/useErrorText'
import { reportIds } from '@/lib/work/reporting-tree'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

const NO_MANAGER = '__none__'

type CoworkerReportingDialogProps = {
    coworker: OrgCoworker | null
    coworkers: OrgCoworker[]
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function CoworkerReportingDialog({ coworker, coworkers, onOpenChange, onSaved }: CoworkerReportingDialogProps) {
    return (
        <Dialog open={!!coworker} onOpenChange={onOpenChange}>
            {coworker && <ReportingForm key={coworker.id} coworker={coworker} coworkers={coworkers} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
        </Dialog>
    )
}

function ReportingForm({ coworker, coworkers, onClose, onSaved }: { coworker: OrgCoworker; coworkers: OrgCoworker[]; onClose: () => void; onSaved: () => void }) {
    const t = useTranslations('teams.org.dialog')
    const errorText = useErrorText()
    const canManage = useCanManageAgent(coworker.id)
    const [title, setTitle] = useState(coworker.title ?? '')
    const [managerId, setManagerId] = useState(coworker.reportsToAgentId ?? NO_MANAGER)
    const [saving, setSaving] = useState(false)

    // A coworker cannot report to anyone under it: they stay listed, greyed, saying why.
    const managers = useMemo(() => {
        const below = reportIds(coworkers, coworker.id)
        return coworkers
            .filter(entry => entry.id !== coworker.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(entry => ({ coworker: entry, loops: below.has(entry.id) }))
    }, [coworkers, coworker.id])

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        const result = await setCoworkerReportingAction(coworker.id, { title: title.trim() || null, reportsToAgentId: managerId === NO_MANAGER ? null : managerId })
        setSaving(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(t('saved'))
        onSaved()
        onClose()
    }

    return (
        <DialogContent className="sm:max-w-md">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description', { name: coworker.name })}</DialogDescription>
                </DialogHeader>
                <Input id="coworker-title" label={t('titleLabel')} placeholder={t('titlePlaceholder')} value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={!canManage} optional />
                <Field label={t('reportsTo')} htmlFor="coworker-manager">
                    <Select value={managerId} onValueChange={setManagerId} disabled={!canManage}>
                        <SelectTrigger id="coworker-manager" className="w-full data-[size=default]:h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            <SelectItem value={NO_MANAGER}>{t('noManager')}</SelectItem>
                            {managers.map(({ coworker: manager, loops }) => (
                                <SelectItem key={manager.id} value={manager.id} disabled={loops}>
                                    <AgentBuddy agentId={manager.id} size={18} animated={false} facing="right" />
                                    <span className="truncate">{manager.name}</span>
                                    {loops && <span className="truncate text-xs text-muted-foreground">{t('loopHint', { name: coworker.name })}</span>}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <TooltipDisabledReason reason={canManage ? undefined : t('manageOnly')}>
                        <Button type="submit" loading={saving} disabled={!canManage} className="w-full sm:w-auto">
                            {t('save')}
                        </Button>
                    </TooltipDisabledReason>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
