'use client'

import { deleteGoalAction } from '@/app/api/_actions/goals.actions'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { useErrorText } from '@/hooks/useErrorText'
import type { GoalTreeNode } from '@/lib/work/goal-tree'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

export function DeleteGoalDialog({ goal, onOpenChange, onDeleted }: { goal: GoalTreeNode | null; onOpenChange: (open: boolean) => void; onDeleted: () => void }) {
    const t = useTranslations('goals.delete')
    const errorText = useErrorText()
    const [pending, setPending] = useState(false)

    const remove = async () => {
        if (!goal) return
        setPending(true)
        const result = await deleteGoalAction(goal.id)
        setPending(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(t('deleted'))
        onOpenChange(false)
        onDeleted()
    }

    return (
        <ConfirmDialog
            open={!!goal}
            onOpenChange={onOpenChange}
            title={goal ? t('title', { title: goal.title }) : ''}
            description={t('description')}
            confirmLabel={t('confirm')}
            pending={pending}
            onConfirm={event => {
                event.preventDefault()
                void remove()
            }}
        />
    )
}
