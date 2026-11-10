'use client'

import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { titleCase } from '@/lib/templates/labels'

export function EnumSelect<T extends string>({
    label,
    value,
    onChange,
    options,
    labels,
    helperText,
}: {
    label: string
    value: T
    onChange: (value: T) => void
    options: readonly T[]
    labels?: Partial<Record<T, string>>
    helperText?: string
}) {
    return (
        <Field label={label} helperText={helperText}>
            <Select value={value} onValueChange={v => onChange(v as T)}>
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map(option => (
                        <SelectItem key={option} value={option}>
                            {labels?.[option] ?? titleCase(option)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    )
}
