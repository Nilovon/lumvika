'use client'

import type { Channel } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { createChannelAction, updateChannelAction } from '@/app/api/_actions/channels.actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useErrorText } from '@/hooks/useErrorText'

type ChannelFormDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    // The channel being edited; none to create one.
    channel?: Pick<Channel, 'id' | 'name' | 'description'>
    onSaved: (channel: Channel) => void
}

// A new channel, or the name and description of one: a short form on one column.
export function ChannelFormDialog({ open, onOpenChange, channel, onSaved }: ChannelFormDialogProps) {
    return <Dialog open={open} onOpenChange={onOpenChange}>{open && <ChannelForm channel={channel} onSaved={onSaved} onCancel={() => onOpenChange(false)} />}</Dialog>
}

function ChannelForm({ channel, onSaved, onCancel }: { channel?: ChannelFormDialogProps['channel']; onSaved: (channel: Channel) => void; onCancel: () => void }) {
    const t = useTranslations('channels.create')
    const tToast = useTranslations('channels.toasts')
    const errorText = useErrorText()
    const [name, setName] = useState(channel?.name ?? '')
    const [description, setDescription] = useState(channel?.description ?? '')
    const [privateChannel, setPrivateChannel] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        const fields = { name: name.trim(), description: description.trim() || null }
        const result = channel ? await updateChannelAction(channel.id, fields) : await createChannelAction({ ...fields, kind: privateChannel ? 'private' : 'public' })
        setSaving(false)
        if (!result.ok) {
            setError(errorText(result))
            return
        }
        if (!channel) toast.success(tToast('created', { name: result.channel.name }))
        onSaved(result.channel)
    }

    return (
        <DialogContent className="sm:max-w-md">
            <form onSubmit={submit} className="grid gap-4">
                <DialogHeader>
                    <DialogTitle>{channel ? t('editTitle', { name: channel.name }) : t('title')}</DialogTitle>
                    <DialogDescription>{channel ? t('editDescription') : t('description')}</DialogDescription>
                </DialogHeader>
                <Input id="channel-name" label={t('name')} placeholder={t('namePlaceholder')} value={name} maxLength={80} autoFocus onChange={event => setName(event.target.value)} />
                <Textarea id="channel-about" label={t('about')} optional placeholder={t('aboutPlaceholder')} value={description} maxLength={2000} rows={3} onChange={event => setDescription(event.target.value)} />
                {!channel && (
                    <Field orientation="row" label={t('private')} helperText={t('privateHint')} htmlFor="channel-private">
                        <Switch id="channel-private" checked={privateChannel} onCheckedChange={setPrivateChannel} />
                    </Field>
                )}
                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}
                <DialogFooter className="flex-wrap gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        {t('cancel')}
                    </Button>
                    <Button type="submit" loading={saving} disabled={!name.trim()}>
                        {channel ? t('save') : t('submit')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
