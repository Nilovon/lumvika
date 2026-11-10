import { Field } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import type { LucideIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function SettingsSection({ title, detail, action, children }: { title: string; detail?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-3 px-1">
                <div className="min-w-0">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
                    {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    )
}

export const SETTINGS_CARD = 'divide-y rounded-lg border'

export function SwitchRow({ icon: RowIcon, label, description, checked, disabled, onChange, extra }: { icon: LucideIcon; label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; extra?: ReactNode }) {
    return (
        <div className={cn('flex items-center gap-3 px-3 py-2.5', disabled && 'opacity-50')}>
            <RowIcon className="size-4 shrink-0 text-muted-foreground" />
            <Field orientation="row" label={label} helperText={description} className="min-w-0 flex-1">
                <div className="flex shrink-0 items-center gap-1">
                    {extra}
                    <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
                </div>
            </Field>
        </div>
    )
}
